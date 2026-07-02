import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * DOM-free invariant. This is a `platform:isomorphic` package consumed by Node
 * packages (daemon, storage). It MUST NOT reference any browser-only global.
 *
 * The test scans every non-test `.ts` source file under `src/` and asserts none
 * contain a forbidden global reference. Forbidden tokens are built by string
 * concatenation so this test file itself does not trip the scan.
 */

const buildForbiddenTokens = (): readonly string[] => [
  "doc" + "ument",
  "win" + "dow",
  "nav" + "igator",
  "local" + "Storage",
  "session" + "Storage",
];

// Strip comments so documentation prose ("this module never reads `window`")
// does not trip the scan; only real code references should be flagged.
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const collectSourceFiles = (srcDir: string): string[] => {
  const out: string[] = [];
  const stack: string[] = [srcDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile() && entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        out.push(full);
      }
    }
  }
  return out;
};

describe("element-identity is DOM-free", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcDir = path.resolve(here);
  const files = existsSync(srcDir) ? collectSourceFiles(srcDir) : [];
  const tokens = buildForbiddenTokens();

  it("scanned at least one non-test source file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no non-test source file references a browser-only global", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of tokens) {
        // Word-boundary match so "document" does not match "documentation".
        const re = new RegExp(`\\b${token}\\b`);
        if (re.test(code)) offenders.push(`${path.relative(srcDir, file)}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports cleanly under a Node environment (no ReferenceError at module load)", async () => {
    const mod = await import("./index.js");
    expect(typeof mod.generateStableSelector).toBe("function");
    expect(typeof mod.computeFingerprint).toBe("function");
  });
});
