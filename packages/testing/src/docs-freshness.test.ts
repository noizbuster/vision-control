import { readFileSync } from "node:fs";
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
