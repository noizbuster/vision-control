import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Release readiness gate (VC-V1V2-24).
 *
 * This is a STRUCTURAL gate: it asserts the preconditions a release must hold,
 * not a re-execution of the release commands. Re-running `pnpm check` /
 * `typecheck` / `test` / `build` / `boundaries` from inside a test would recurse
 * (`pnpm test` -> this test -> `pnpm test` -> ...). The actual command output is
 * captured verbatim in the task evidence file
 * (`.omo/evidence/task-24-vision-control-v1-v2.md`); this gate asserts the
 * structural shape that makes those commands meaningful:
 *
 *   - the six root release scripts exist and are runnable,
 *   - every workspace package shares one synchronized version,
 *   - the ADR registry is complete and well-formed,
 *   - the release docs (notes, feature matrix, migration, known limitations)
 *     exist and are non-empty,
 *   - no source-mutating MCP tool exists (read-only contract),
 *   - the evidence convention directory is present,
 *   - every packages/* project.json defines package+publish targets (Task 44),
 *   - every test.fixme in PRD §31.5 e2e specs carries an OUT rationale (Task 41),
 *   - the removed verification-plan constant is absent from all source (Task 33),
 *   - vanilla-css graduated from the V1 not-implemented stub list (Task 45).
 *
 * Green here means "structurally releasable"; the command-level proof lives in
 * the evidence file.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

interface Pkg {
  readonly name: string;
  readonly version: string;
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

/** Discover every workspace package.json (packages/, apps/, integrations/, tools/). */
function listWorkspaceManifests(): string[] {
  const roots = ["packages", "apps", "integrations", "tools"];
  const out: string[] = [];
  for (const root of roots) {
    const dir = path.join(repoRoot, root);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(dir, entry.name, "package.json");
      if (existsSync(manifest)) out.push(manifest);
    }
  }
  return out;
}

interface NxProjectConfig {
  readonly targets?: Record<string, unknown>;
}

/** packages/* directories are the publishable workspace libraries (Task 44). */
function listPackagesProjectConfigs(): string[] {
  const dir = path.join(repoRoot, "packages");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, "project.json"))
    .filter((f) => existsSync(f));
}

const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".output",
  ".wxt",
  ".omo",
  "playwright-report",
  "test-results",
  ".cache",
  "coverage",
]);
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs", ".json", ".md"]);

/** Walk source files, skipping build/cache/vendor subtrees (content-scan only). */
function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SCAN_SKIP_DIRS.has(e.name)) walkSourceFiles(full, acc);
    } else if (e.isFile() && SCAN_EXTS.has(path.extname(e.name))) {
      acc.push(full);
    }
  }
  return acc;
}

const REQUIRED_RELEASE_SCRIPTS = [
  "check",
  "typecheck",
  "test",
  "build",
  "boundaries",
  "test:e2e",
] as const;

describe("release readiness: root gate scripts", () => {
  it("the six root release scripts are defined in package.json", () => {
    const pkg = readJson(path.join(repoRoot, "package.json")) as {
      scripts?: Record<string, string>;
    };
    const scripts = new Set(Object.keys(pkg.scripts ?? {}));
    const missing = REQUIRED_RELEASE_SCRIPTS.filter((s) => !scripts.has(s));
    expect(missing, `root package.json must define release scripts: ${missing.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("release readiness: version synchronization", () => {
  it("every workspace package shares one synchronized version", () => {
    const manifests = listWorkspaceManifests();
    expect(manifests.length, "workspace packages must be discoverable").toBeGreaterThan(20);
    const versions = new Map<string, string[]>();
    for (const manifest of manifests) {
      const pkg = readJson(manifest) as Pkg;
      const list = versions.get(pkg.version) ?? [];
      list.push(pkg.name);
      versions.set(pkg.version, list);
    }
    expect(
      versions.size,
      `workspace packages must be version-synchronized; found distinct versions: ${[...versions.keys()].join(", ")}`,
    ).toBe(1);
  });

  it("the synchronized version is a valid semver-like string", () => {
    const manifests = listWorkspaceManifests();
    const sample = readJson(manifests[0] ?? "") as Pkg;
    expect(sample.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

const ADR_DIR = path.join(repoRoot, "docs", "adr");
const REQUIRED_ADR_SECTIONS = [
  "## Status",
  "## Context",
  "## Decision",
  "## Consequences",
  "## MVP Guardrail",
];

function listAdrFiles(): string[] {
  return readdirSync(ADR_DIR)
    .filter((f) => /^ADR-\d{3}-.+\.md$/.test(f))
    .sort();
}

describe("release readiness: ADR registry completeness", () => {
  it("every ADR has the 5 required sections in order", () => {
    const adrs = listAdrFiles();
    expect(adrs.length).toBeGreaterThanOrEqual(18);
    const errors: string[] = [];
    for (const file of adrs) {
      const content = readFileSync(path.join(ADR_DIR, file), "utf8");
      let last = -1;
      for (const section of REQUIRED_ADR_SECTIONS) {
        const idx = content.indexOf(section, last + 1);
        if (idx === -1) {
          errors.push(`${file}: missing or out-of-order "${section}"`);
          break;
        }
        last = idx;
      }
    }
    expect(errors, `ADR section audit failures:\n${errors.join("\n")}`).toEqual([]);
  });

  it("the ADR index registers every ADR file", () => {
    const index = readFileSync(path.join(ADR_DIR, "README.md"), "utf8");
    for (const file of listAdrFiles()) {
      expect(index, `ADR index must reference ${file}`).toContain(file);
    }
  });
});

const RELEASE_DOCS = [
  "release-notes-v0.2.0.md",
  "feature-matrix.md",
  "migration-v0.1.0-to-v0.2.0.md",
  "known-limitations.md",
];

describe("release readiness: release docs present", () => {
  for (const doc of RELEASE_DOCS) {
    it(`${doc} exists and is non-trivial`, () => {
      const full = path.join(repoRoot, "docs", doc);
      expect(existsSync(full), `${doc} must exist for the v0.2.0 release`).toBe(true);
      const stat = statSync(full);
      const content = readFileSync(full, "utf8");
      expect(stat.size, `${doc} must be non-empty`).toBeGreaterThan(300);
      expect(content.length, `${doc} must have real content`).toBeGreaterThan(300);
    });
  }

  it("README references the feature matrix and v0.2.0 release notes", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
    expect(readme).toContain("feature-matrix.md");
    expect(readme).toContain("release-notes-v0.2.0.md");
    expect(readme).toContain("known-limitations.md");
  });
});

// Concatenation so this source holds no literal forbidden token (same guard as
// docs-freshness.test.ts).
const FORBIDDEN_TOOL = "vision_" + "apply_deterministic_patch";
const SOURCE_MUTATING_PATTERNS: readonly (string | RegExp)[] = [
  FORBIDDEN_TOOL,
  /^vision_apply_/,
  /^vision_write_/,
  /^vision_codemod_/,
];

function isSourceMutatingTool(name: string): boolean {
  return SOURCE_MUTATING_PATTERNS.some((p) => (typeof p === "string" ? name === p : p.test(name)));
}

describe("release readiness: read-only MCP contract", () => {
  it("the MCP tool registry contains no source-mutating tool", () => {
    const source = readFileSync(
      path.join(repoRoot, "packages", "mcp-server", "src", "tools", "index.ts"),
      "utf8",
    );
    const names: string[] = [];
    const arrayStart = source.indexOf("export const TOOL_NAMES");
    const arrayEnd = source.indexOf("] as const;", arrayStart);
    const arrayBlock = source.slice(arrayStart, arrayEnd);
    for (const match of arrayBlock.matchAll(/"((?:vision_)[a-z_]+)"/g)) {
      if (match[1]) names.push(match[1]);
    }
    const offenders = names.filter(isSourceMutatingTool);
    expect(
      offenders,
      `MCP tool registry must contain no source-mutating tool: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("release readiness: evidence convention", () => {
  it("the .omo/evidence directory exists for release verification records", () => {
    const evidenceDir = path.join(repoRoot, ".omo", "evidence");
    expect(existsSync(evidenceDir), ".omo/evidence must exist for release records").toBe(true);
  });
});

describe("release readiness: publishable package targets (Task 44)", () => {
  it("every packages/* project.json defines package and publish targets", () => {
    const configs = listPackagesProjectConfigs();
    expect(configs.length, "packages/* project.json must be discoverable").toBeGreaterThan(20);
    const missing: string[] = [];
    for (const config of configs) {
      const parsed = readJson(config) as NxProjectConfig;
      const targets = new Set(Object.keys(parsed.targets ?? {}));
      if (!targets.has("package")) {
        missing.push(`${path.relative(repoRoot, config)}: missing "package"`);
      }
      if (!targets.has("publish")) {
        missing.push(`${path.relative(repoRoot, config)}: missing "publish"`);
      }
    }
    expect(
      missing,
      `publishable packages must define package+publish targets:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});

describe("release readiness: e2e stub discipline (Task 41 / PRD §31.5)", () => {
  it("every test.fixme in extension e2e specs carries an OUT rationale", () => {
    const e2eDir = path.join(repoRoot, "apps", "extension", "e2e");
    expect(existsSync(e2eDir), "extension e2e directory must exist").toBe(true);
    const specs = readdirSync(e2eDir)
      .filter((f) => f.endsWith(".spec.ts"))
      .sort();
    expect(specs.length, "extension e2e specs must exist").toBeGreaterThan(0);
    const violations: string[] = [];
    for (const name of specs) {
      const lines = readFileSync(path.join(e2eDir, name), "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined || !line.includes("test.fixme(")) continue;
        let prev = i - 1;
        while (prev >= 0 && lines[prev]?.trim() === "") prev--;
        if (prev < 0 || !lines[prev]?.includes("// OUT:")) {
          violations.push(`${name}:${i + 1} — test.fixme without a "// OUT:" rationale`);
        }
      }
    }
    expect(
      violations,
      `e2e test.fixme stubs must carry explicit OUT rationale:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

// Concatenation so this source holds no literal forbidden token (Task 33).
const REMOVED_PLAN_TOKEN = "STUB_" + "VERIFICATION_" + "PLAN";

describe("release readiness: removed plan token is absent (Task 33)", () => {
  it("no source file re-introduces the removed verification-plan constant", () => {
    const files = walkSourceFiles(repoRoot);
    expect(files.length, "source tree must be walkable").toBeGreaterThan(100);
    const hits: string[] = [];
    for (const file of files) {
      if (readFileSync(file, "utf8").includes(REMOVED_PLAN_TOKEN)) {
        hits.push(path.relative(repoRoot, file));
      }
    }
    expect(hits, `the removed plan constant must not reappear:\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("release readiness: vanilla-css graduated from V1 stubs (Task 45)", () => {
  it("VANILLA_CSS_ADAPTER is absent from V1_NOT_IMPLEMENTED_ADAPTERS", () => {
    const source = readFileSync(
      path.join(repoRoot, "packages", "source-resolver", "src", "v1-stubs.ts"),
      "utf8",
    );
    const decl = source.indexOf("V1_NOT_IMPLEMENTED_ADAPTERS");
    expect(decl, "V1_NOT_IMPLEMENTED_ADAPTERS must still be declared").toBeGreaterThan(-1);
    const start = source.indexOf("[", decl);
    const end = source.indexOf("];", start);
    expect(end, "V1_NOT_IMPLEMENTED_ADAPTERS array must be terminated").toBeGreaterThan(-1);
    const body = source.slice(start, end).toLowerCase();
    expect(
      body,
      "V1_NOT_IMPLEMENTED_ADAPTERS must not list vanilla-css (Task 45 graduated it)",
    ).not.toContain("vanilla");
  });
});
