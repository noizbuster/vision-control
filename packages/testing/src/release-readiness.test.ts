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
 *   - vanilla-css graduated from the V1 not-implemented stub list (Task 45),
 *   - every wired V1 editing feature has a real (non-fixme) browser-driven e2e
 *     OR a documented harness-blocker rationale (v0.2.0 honesty gate — a feature
 *     cannot pass on stub rationale alone; the blocker must be traceable to
 *     docs/known-limitations.md).
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

/**
 * Wired V1 editing features with dedicated extension browser-e2e specs (the W2
 * plan wired their content-runtime emission). Each MUST carry at least one real
 * (non-`test.fixme`) browser-driven test in its `@… browser` describe block, OR
 * be registered in {@link HARNESS_BLOCKED_FEATURES} with a documented limitation.
 * This stops the gate passing on stub rationale alone.
 */
const WIRED_V1_BROWSER_SPECS: readonly {
  readonly feature: string;
  readonly spec: string;
}[] = [
  { feature: "multi-select", spec: "multi-select.spec.ts" },
  { feature: "group-move", spec: "group-move.spec.ts" },
  { feature: "css-grid-edit", spec: "css-grid-edit.spec.ts" },
  { feature: "alignment-distribution", spec: "alignment-distribution.spec.ts" },
  { feature: "auto-layout", spec: "auto-layout.spec.ts" },
];

/**
 * Features whose browser-driven e2e is blocked by the panel-automation harness
 * limitation. The DevTools panel is not reachable as a Playwright page target
 * (`--auto-open-devtools-for-tabs` exposes only the frontend, not the panel),
 * and Move/panel modes have no keyboard shortcut. Each entry MUST be documented
 * in `docs/known-limitations.md` (with its spec cited) or the gate fails — a
 * blocker cannot be asserted without a written, traceable limitation.
 */
const HARNESS_BLOCKED_FEATURES = new Set([
  "group-move",
  "css-grid-edit",
  "alignment-distribution",
  "auto-layout",
]);

/**
 * Count non-`test.fixme` `test(` calls inside a `@… browser` describe block.
 * Tracks the innermost `test.describe(` name; a `test(` counts only while that
 * name includes "browser". These specs are flat (one level of describe), so the
 * innermost-name heuristic is exact.
 */
function countNonFixmeBrowserTests(source: string): number {
  let currentDescribe = "";
  let count = 0;
  for (const line of source.split("\n")) {
    const describeMatch = line.match(/test\.describe\(\s*["']([^"']*)["']/);
    if (describeMatch && describeMatch[1] !== undefined) {
      currentDescribe = describeMatch[1];
      continue;
    }
    if (currentDescribe.includes("browser") && line.includes("test(")) {
      // `test.fixme(` / `test.describe(` / `test.step(` do not contain the
      // literal substring "test(" (the char after "test" is ".", not "(").
      count++;
    }
  }
  return count;
}

describe("release readiness: wired V1 feature browser-e2e honesty gate", () => {
  it("every wired V1 editing feature has a real browser e2e OR a documented blocker", () => {
    const e2eDir = path.join(repoRoot, "apps", "extension", "e2e");
    const failures: string[] = [];
    for (const { feature, spec } of WIRED_V1_BROWSER_SPECS) {
      const specPath = path.join(e2eDir, spec);
      if (!existsSync(specPath)) {
        failures.push(`${feature}: spec ${spec} missing`);
        continue;
      }
      const realCount = countNonFixmeBrowserTests(readFileSync(specPath, "utf8"));
      if (realCount > 0) continue;
      if (!HARNESS_BLOCKED_FEATURES.has(feature)) {
        failures.push(
          `${feature}: 0 real browser tests in ${spec} and no documented blocker — stub rationale alone is insufficient`,
        );
      }
    }
    expect(
      failures,
      `wired V1 features must have a real browser e2e or a documented blocker:\n${failures.join("\n")}`,
    ).toEqual([]);
  });

  it("every harness-blocked feature is documented in known-limitations.md", () => {
    const limitations = readFileSync(path.join(repoRoot, "docs", "known-limitations.md"), "utf8");
    expect(
      limitations,
      "known-limitations.md must document the panel-automation harness blocker",
    ).toContain("panel-automation");
    const failures: string[] = [];
    for (const { feature, spec } of WIRED_V1_BROWSER_SPECS) {
      if (!HARNESS_BLOCKED_FEATURES.has(feature)) continue;
      if (!limitations.includes(spec)) {
        failures.push(
          `${feature}: blocker not traceable — ${spec} not cited in known-limitations.md`,
        );
      }
    }
    expect(
      failures,
      `blocked features must cite their spec in known-limitations.md:\n${failures.join("\n")}`,
    ).toEqual([]);
  });
});

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

describe("release readiness: C7 Delete packages are gone (extension-sot task 21)", () => {
  it("daemon and marker/workspace packages are not present on disk", () => {
    const deleted = [
      "apps/daemon",
      "packages/daemon-core",
      "packages/daemon-client",
      "packages/storage",
      "packages/workspace-index",
      "packages/source-resolver",
      "packages/source-registry",
      "integrations/vite-react",
      "integrations/next-react",
      "integrations/tailwind",
      "integrations/css-modules",
      "integrations/vanilla-css",
      "integrations/vue",
      "integrations/svelte",
    ];
    const stillPresent = deleted.filter((rel) => existsSync(path.join(repoRoot, rel)));
    expect(stillPresent, `C7 Delete rows must be removed:\n${stillPresent.join("\n")}`).toEqual([]);
  });
});
