import { existsSync, readdirSync, readFileSync } from "node:fs";
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

  it("the V1/V2 policy-gate ADRs (011-018) all exist", () => {
    const nums = new Set(listAdrFiles().map((a) => a.num));
    for (const n of [11, 12, 13, 14, 15, 16, 17, 18]) {
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
      "vision_clear_preview",
      "vision_request_verification",
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

/**
 * Canonical MCP tool names, sourced from the server's TOOL_NAMES const so this
 * check cannot drift when a tool is added or renamed. Parsed out of source
 * (not imported) so packages/testing stays a leaf with no workspace dependency
 * on @vision-control/mcp-server.
 */
function loadCanonicalToolNames(): readonly string[] {
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
  return names;
}

function listFiles(dir: string, exts: readonly string[]): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(listFiles(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function extractToolRefs(text: string): string[] {
  const refs: string[] = [];
  for (const match of text.matchAll(/\bvision_[a-z][a-z_]*\b/g)) {
    if (match[0]) refs.push(match[0]);
  }
  return refs;
}

describe("docs freshness: OpenCode and Pi integration docs", () => {
  const integrationDocs: { label: string; root: string }[] = [
    { label: "opencode", root: path.join(repoRoot, "integrations", "opencode") },
    { label: "pi", root: path.join(repoRoot, "integrations", "pi") },
  ];

  // markdown docs + json examples only; .ts source holds test-only regex
  // patterns and is out of scope for a docs-freshness scan.
  const DOC_EXTS = [".md", ".json"];

  for (const { label, root } of integrationDocs) {
    it(`${label}: every vision_* reference is a current tool name`, () => {
      const canonical = new Set(loadCanonicalToolNames());
      const files = listFiles(root, DOC_EXTS);
      expect(files.length, `${label} docs must exist`).toBeGreaterThan(0);

      const stale: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const ref of extractToolRefs(text)) {
          if (!canonical.has(ref)) {
            stale.push(`${path.relative(repoRoot, file)}: unknown tool "${ref}"`);
          }
        }
      }
      expect(
        stale,
        `${label} docs reference tool names that are not in packages/mcp-server TOOL_NAMES: ${stale.join(", ")}. Use a current name or rephrase to avoid naming a tool that does not exist.`,
      ).toEqual([]);
    });

    it(`${label}: docs never reference a source-mutating or forbidden tool`, () => {
      const files = listFiles(root, DOC_EXTS);
      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const ref of extractToolRefs(text)) {
          if (isSourceMutatingTool(ref)) {
            offenders.push(`${path.relative(repoRoot, file)}: forbidden tool "${ref}"`);
          }
        }
      }
      expect(
        offenders,
        `${label} docs reference a forbidden source-mutating tool: ${offenders.join(", ")}. The MCP server is read-only; describe the absent tool in words rather than naming it.`,
      ).toEqual([]);
    });
  }

  it("the forbidden-tool guard catches a doc that names it (negative fixture)", () => {
    const poisoned = `Call ${FORBIDDEN_TOOL} to apply the change.`;
    const offenders = extractToolRefs(poisoned).filter(isSourceMutatingTool);
    expect(offenders, `a doc naming the forbidden tool must fail the read-only guard`).toContain(
      FORBIDDEN_TOOL,
    );
  });

  it("the canonical tool list is the expected C5 read-only set (nine tools)", () => {
    const canonical = loadCanonicalToolNames();
    expect(canonical).toHaveLength(9);
    expect(canonical.filter(isSourceMutatingTool)).toEqual([]);
    expect(canonical).toContain("vision_get_active_session");
    expect(canonical).toContain("vision_mark_patch_completed");
    expect(canonical).not.toContain("vision_capture_element");
    expect(canonical).not.toContain("vision_get_diagnostics");
  });
});

const RELEASE_DOCS: { file: string; mustContain: readonly string[] }[] = [
  {
    file: "release-notes-v0.2.0.md",
    mustContain: ["v0.2.0", "ADR-016", "ADR-017"],
  },
  {
    file: "feature-matrix.md",
    mustContain: ["MVP", "V1", "V2"],
  },
  {
    file: "migration-v0.1.0-to-v0.2.0.md",
    mustContain: ["1.1.0", "codemod"],
  },
  {
    file: "known-limitations.md",
    mustContain: ["ADR-018", "ADR-017", "advisory"],
  },
];

describe("docs freshness: v0.2.0 release docs", () => {
  for (const { file, mustContain } of RELEASE_DOCS) {
    it(`${file} exists and covers its required topics`, () => {
      const full = path.join(repoRoot, "docs", file);
      expect(existsSync(full), `${file} must exist for the v0.2.0 release`).toBe(true);
      const content = readFileSync(full, "utf8");
      const missing = mustContain.filter((token) => !content.includes(token));
      expect(
        missing,
        `${file} must mention: ${mustContain.join(", ")} (missing: ${missing.join(", ")})`,
      ).toEqual([]);
    });
  }

  it("release docs do not overclaim full Firefox parity", () => {
    const notes = readFileSync(path.join(repoRoot, "docs", "release-notes-v0.2.0.md"), "utf8");
    const matrix = readFileSync(path.join(repoRoot, "docs", "feature-matrix.md"), "utf8");
    const limitations = readFileSync(path.join(repoRoot, "docs", "known-limitations.md"), "utf8");
    // The phrase "full Firefox parity" must only appear in a caveat/limitation
    // context, never as an unconditional claim. Known-limitations may use it in
    // the negative ("does not claim full Firefox parity").
    for (const [label, text] of [
      ["release-notes", notes],
      ["feature-matrix", matrix],
    ] as const) {
      const unqualified =
        /full Firefox parity/i.test(text) &&
        !/not.*full Firefox parity|does not claim.*full Firefox parity/i.test(text);
      expect(
        unqualified,
        `${label} must not claim unconditional full Firefox parity (ADR-016 bounds it to tested scope)`,
      ).toBe(false);
    }
    expect(limitations, "known-limitations must bound the Firefox claim").toMatch(
      /not.*claim full Firefox parity/i,
    );
  });

  it("release docs do not claim automated accessibility repair", () => {
    const notes = readFileSync(path.join(repoRoot, "docs", "release-notes-v0.2.0.md"), "utf8");
    const limitations = readFileSync(path.join(repoRoot, "docs", "known-limitations.md"), "utf8");
    // "automated accessibility repair" may only appear in a caveat, never as a
    // shipped capability claim.
    const unqualifiedClaim =
      /automated accessibility repair(?!.*beyond|.*deferred|.*advisory)/i.test(notes);
    expect(
      unqualifiedClaim,
      "release notes must not claim automated accessibility repair as shipped (ADR-017: advisory only)",
    ).toBe(false);
    expect(limitations, "known-limitations must state a11y is advisory only").toMatch(
      /advisory( suggestions)? only/i,
    );
  });
});
