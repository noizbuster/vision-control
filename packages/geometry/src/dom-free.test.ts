import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * DOM-free invariant. `@vision-control/geometry` is `platform:isomorphic` and
 * consumed by Node packages. It MUST NOT reference any browser-only global.
 * See the element-identity sibling test for the full rationale.
 */

const buildForbiddenTokens = (): readonly string[] => [
  "doc" + "ument",
  "win" + "dow",
  "nav" + "igator",
  "local" + "Storage",
  "session" + "Storage",
];

/**
 * Strip `//` line comments and `/* *\/` block comments so that documentation
 * prose (e.g. "this module never reads `window.scrollY`") does not trip the
 * scan. Only real code references should be flagged.
 */
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

describe("geometry is DOM-free", () => {
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
        const re = new RegExp(`\\b${token}\\b`);
        if (re.test(code)) offenders.push(`${path.relative(srcDir, file)}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports cleanly under a Node environment (no ReferenceError at module load)", async () => {
    const mod = await import("./index.js");
    expect(typeof mod.identity).toBe("function");
    expect(typeof mod.fromString).toBe("function");
  });
});
