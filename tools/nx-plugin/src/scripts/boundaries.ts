/**
 * Workspace package-boundary conformance checker.
 *
 * Standalone (only `node:*` builtins) so it runs directly via Node's native
 * TypeScript stripping: `node src/scripts/boundaries.ts`. Exposed as the nx
 * target `tools-nx-plugin:boundaries` and the root script `pnpm boundaries`,
 * which lets it compose with `nx affected`.
 *
 * Rules enforced (PRD 20.3 + 35.2):
 *   1. A `platform:node` package MUST NOT import a `platform:browser` package.
 *   2. No source file may deep-import another workspace package's `src/*`
 *      (e.g. `@vision-control/protocol/src/internal`).
 *
 * The checker is tag-driven: it reads each package's `project.json#tags` and
 * `package.json#name`, so re-tagging a package instantly changes enforcement
 * with no code change.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOTS = ["apps", "integrations", "packages", "tools"];

export type Platform = "browser" | "isomorphic" | "node" | undefined;

export interface PackageInfo {
  readonly dir: string; // repo-root-relative, posix
  readonly projectName: string;
  readonly packageName: string | undefined; // @vision-control/<x> from package.json
  readonly platform: Platform;
  readonly tags: readonly string[];
}

export interface BoundaryViolation {
  readonly rule: "node-imports-browser" | "deep-import";
  readonly file: string;
  readonly importer: string;
  readonly specifier: string;
  readonly detail: string;
}

export interface BoundaryReport {
  readonly packages: readonly PackageInfo[];
  readonly filesScanned: number;
  readonly violations: readonly BoundaryViolation[];
}

const toPosix = (p: string): string => p.split("\\").join("/");

const platformFromTags = (tags: readonly string[]): Platform => {
  const tag = tags.find((t) => t.startsWith("platform:"));
  if (!tag) return undefined;
  return tag.slice("platform:".length) as Platform;
};

const safeReadJson = <T>(filePath: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
};

const findRepoRoot = (start: string): string => {
  let dir = start;
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate repo root (pnpm-workspace.yaml) from ${start}`);
};

interface ProjectJson {
  readonly name?: string;
  readonly tags?: readonly string[];
}

const discoverPackages = (repoRoot: string): PackageInfo[] => {
  const packages: PackageInfo[] = [];
  for (const root of SOURCE_ROOTS) {
    const rootDir = path.join(repoRoot, root);
    if (!existsSync(rootDir)) continue;
    for (const entry of readdirSync(rootDir)) {
      const dir = path.join(rootDir, entry);
      if (!statSync(dir).isDirectory()) continue;
      const projectPath = path.join(dir, "project.json");
      if (!existsSync(projectPath)) continue;
      const project = safeReadJson<ProjectJson>(projectPath);
      if (!project) continue;
      const tags = project.tags ?? [];
      const pkg = safeReadJson<{ name?: string }>(path.join(dir, "package.json"));
      packages.push({
        dir: toPosix(path.relative(repoRoot, dir)),
        projectName: project.name ?? entry,
        packageName: pkg?.name,
        platform: platformFromTags(tags),
        tags,
      });
    }
  }
  return packages;
};

const walkSourceFiles = (packageDir: string): string[] => {
  const out: string[] = [];
  const srcDir = path.join(packageDir, "src");
  if (!existsSync(srcDir)) return out;
  const stack: string[] = [srcDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        stack.push(full);
      } else if (st.isFile() && /\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
  }
  return out;
};

const IMPORT_SPEC_RE =
  /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const extractSpecifiers = (source: string): string[] => {
  const specs: string[] = [];
  for (const match of source.matchAll(IMPORT_SPEC_RE)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec) specs.push(spec);
  }
  return specs;
};

const parseOrgPackage = (
  specifier: string,
): { packageName: string; subpath: string } | undefined => {
  const match = specifier.match(/^(@vision-control\/[^/]+)(\/.*)?$/);
  const packageName = match?.[1];
  if (!packageName) return undefined;
  return { packageName, subpath: match[2] ?? "" };
};

/**
 * Runs the boundary analysis against `repoRoot` and returns a structured report.
 * Pure (no process exit) so the vitest suite can assert on it directly.
 */
export const checkBoundaries = (repoRoot: string): BoundaryReport => {
  const packages = discoverPackages(repoRoot);
  const byDir = new Map(packages.map((p) => [p.dir, p]));
  const byPackage = new Map<string, PackageInfo>();
  for (const p of packages) {
    if (p.packageName) byPackage.set(p.packageName, p);
  }
  // Longest-prefix match helper: which package owns a given repo-relative file.
  const ownerOf = (relFile: string): PackageInfo | undefined => {
    let best: PackageInfo | undefined;
    for (const p of packages) {
      const prefix = `${p.dir}/`;
      if (relFile.startsWith(prefix)) {
        if (!best || p.dir.length > best.dir.length) best = p;
      }
    }
    return best;
  };

  const violations: BoundaryViolation[] = [];
  let filesScanned = 0;

  for (const pkg of packages) {
    if (!byDir.has(pkg.dir)) continue;
    const absDir = path.join(repoRoot, pkg.dir);
    for (const file of walkSourceFiles(absDir)) {
      filesScanned += 1;
      const relFile = toPosix(path.relative(repoRoot, file));
      const source = readFileSync(file, "utf8");
      const importer = ownerOf(relFile);
      const importerName = importer?.packageName ?? importer?.projectName ?? relFile;
      for (const spec of extractSpecifiers(source)) {
        const parsed = parseOrgPackage(spec);
        if (!parsed) continue; // not an internal @vision-control import
        const { packageName: targetName, subpath } = parsed;

        // Rule 2: deep import into another package's src/*.
        if (subpath.startsWith("/src")) {
          violations.push({
            rule: "deep-import",
            file: relFile,
            importer: importerName,
            specifier: spec,
            detail: `deep import of ${targetName} src — import the package root instead`,
          });
          continue;
        }
        const target = byPackage.get(targetName);
        if (!target) continue; // unknown internal package; not a boundary rule
        // Rule 1: node package importing a browser package.
        if (importer?.platform === "node" && target.platform === "browser") {
          violations.push({
            rule: "node-imports-browser",
            file: relFile,
            importer: importerName,
            specifier: spec,
            detail: `node package ${importerName} cannot import browser package ${targetName}`,
          });
        }
      }
    }
  }

  return { packages, filesScanned, violations };
};

const formatReport = (report: BoundaryReport): string => {
  const lines: string[] = [];
  lines.push("vision-control boundary check");
  lines.push(`  packages: ${report.packages.length}`);
  lines.push(`  source files scanned: ${report.filesScanned}`);
  if (report.violations.length === 0) {
    lines.push("  result: PASS (no boundary violations)");
    return lines.join("\n");
  }
  lines.push(`  result: FAIL (${report.violations.length} violation(s))`);
  for (const v of report.violations) {
    lines.push(`  - [${v.rule}] ${v.file}`);
    lines.push(`      ${v.detail}`);
    lines.push(`      import: ${v.specifier}`);
  }
  return lines.join("\n");
};

const main = (): never => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(here);
  const report = checkBoundaries(repoRoot);
  console.log(formatReport(report));
  process.exit(report.violations.length === 0 ? 0 : 1);
};

// Run only when executed directly (not when imported by the test suite).
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
