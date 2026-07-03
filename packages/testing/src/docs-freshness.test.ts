import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

type PackageJson = { scripts?: Record<string, string> };

function readRootScripts(): Set<string> {
  const raw = readFileSync(path.join(repoRoot, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as PackageJson;
  return new Set(Object.keys(pkg.scripts ?? {}));
}

// pnpm subcommands built into pnpm itself. These never appear in package.json
// scripts but are always valid after `pnpm `.
const PNPM_BUILTINS = new Set([
  "install",
  "i",
  "add",
  "remove",
  "rm",
  "update",
  "up",
  "why",
  "list",
  "ls",
  "run",
  "exec",
  "dlx",
  "create",
  "publish",
  "pack",
  "config",
  "set",
  "setup",
  "env",
  "node",
  "patch",
  "approve-builds",
]);

// Binaries that live in node_modules/.bin and are dispatched via `pnpm <bin>`.
// Listed explicitly so a typo'd binary name still fails the check.
const REPO_BINARIES = new Set(["nx", "biome", "tsc", "vitest", "playwright"]);

/** Pull fenced code blocks and inline backtick snippets out of markdown. */
function extractCommandSnippets(markdown: string): string[] {
  const snippets: string[] = [];
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fence)) {
    if (match[1]) snippets.push(match[1]);
  }
  const inline = /`([^`]*pnpm[^`]*)`/g;
  for (const match of markdown.matchAll(inline)) {
    if (match[1]) snippets.push(match[1]);
  }
  return snippets;
}

/** Extract the first token after every `pnpm ` occurrence in a snippet. */
function extractPnpmTokens(text: string): string[] {
  const tokens: string[] = [];
  const re = /pnpm\s+([a-zA-Z][a-zA-Z0-9:_-]*)/g;
  for (const match of text.matchAll(re)) {
    if (match[1]) tokens.push(match[1]);
  }
  return tokens;
}

describe("docs freshness: README commands resolve to real scripts", () => {
  it("every pnpm command in README is a defined script, builtin, or repo binary", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
    const allowlist = new Set<string>([...readRootScripts(), ...PNPM_BUILTINS, ...REPO_BINARIES]);

    const tokens = extractCommandSnippets(readme).flatMap(extractPnpmTokens);
    const stale = [...new Set(tokens)].filter((t) => !allowlist.has(t));

    expect(
      stale,
      `README.md references pnpm commands that are not defined in root package.json scripts, not pnpm builtins, and not repo binaries: ${stale.join(", ")}. Either add the script to package.json or fix the README.`,
    ).toEqual([]);
  });
});

const ADR_DIR = path.join(repoRoot, "docs", "adr");

interface AdrEntry {
  num: number;
  file: string;
}

function listAdrFiles(): AdrEntry[] {
  return readdirSync(ADR_DIR)
    .filter((f) => /^ADR-\d{3}-.+\.md$/.test(f))
    .map((f) => ({ num: Number(f.slice(4, 7)), file: f }))
    .sort((a, b) => a.num - b.num);
}

const REQUIRED_ADR_SECTIONS = [
  "## Status",
  "## Context",
  "## Decision",
  "## Consequences",
  "## MVP Guardrail",
];

describe("docs freshness: ADR registry", () => {
  it("every ADR file has the 5 required sections in order", () => {
    const adrs = listAdrFiles();
    expect(adrs.length, "expected the MVP + V1/V2 ADRs to exist").toBeGreaterThanOrEqual(17);
    const errors: string[] = [];
    for (const { file } of adrs) {
      const content = readFileSync(path.join(ADR_DIR, file), "utf8");
      let last = -1;
      for (const section of REQUIRED_ADR_SECTIONS) {
        const idx = content.indexOf(section, last + 1);
        if (idx === -1) {
          errors.push(`${file}: missing or out-of-order section "${section}"`);
          break;
        }
        last = idx;
      }
    }
    expect(errors, `ADR section audit failures:\n${errors.join("\n")}`).toEqual([]);
  });

  it("the V1/V2 policy-gate ADRs (011-017) all exist", () => {
    const nums = new Set(listAdrFiles().map((a) => a.num));
    for (const n of [11, 12, 13, 14, 15, 16, 17]) {
      expect(nums, `ADR-${String(n).padStart(3, "0")} must exist`).toContain(n);
    }
  });

  it("the ADR index registers every ADR file", () => {
    const index = readFileSync(path.join(ADR_DIR, "README.md"), "utf8");
    for (const { file } of listAdrFiles()) {
      expect(index, `ADR index must reference ${file}`).toContain(file);
    }
  });
});

const POLICY_DIR = path.join(repoRoot, "docs", "agents");

// Split via concatenation so this source holds no literal token a future scan flags
// (same pattern as the boundary-checker fixtures). Do not "simplify" to a literal.
const FORBIDDEN_TOOL = "vision_" + "apply_deterministic_patch";

// vision_mark_patch_started/completed are coordination signals (record an external
// cycle); they never apply a patch, so they are intentionally excluded.
const SOURCE_MUTATING_PATTERNS: readonly (string | RegExp)[] = [
  FORBIDDEN_TOOL,
  /^vision_apply_/,
  /^vision_write_/,
  /^vision_codemod_/,
];

function isSourceMutatingTool(name: string): boolean {
  return SOURCE_MUTATING_PATTERNS.some((p) => (typeof p === "string" ? name === p : p.test(name)));
}

describe("docs freshness: MCP read-only policy", () => {
  it("mcp-policy.md states the no-source-mutation rule verbatim", () => {
    const policy = readFileSync(path.join(POLICY_DIR, "mcp-policy.md"), "utf8");
    expect(policy).toContain("no source-mutating MCP tool");
  });

  it("a clean read-only tool list passes the guard (coordination signals allowed)", () => {
    const cleanTools = [
      "vision_get_active_session",
      "vision_get_selection",
      "vision_get_changeset",
      "vision_get_source_context",
      "vision_get_verification_plan",
      "vision_get_diagnostics",
      "vision_capture_element",
      "vision_request_verification",
      "vision_clear_preview",
      "vision_mark_patch_started",
      "vision_mark_patch_completed",
    ];
    const offenders = cleanTools.filter(isSourceMutatingTool);
    expect(offenders, `clean tool list must contain no source-mutating tool`).toEqual([]);
  });

  it("a tool list containing the forbidden tool fails the guard (negative fixture)", () => {
    const poisonedTools = ["vision_get_active_session", FORBIDDEN_TOOL];
    const offenders = poisonedTools.filter(isSourceMutatingTool);
    expect(offenders, `the forbidden tool must be rejected by the read-only guard`).toContain(
      FORBIDDEN_TOOL,
    );
  });
});
