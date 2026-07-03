import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { isNextProduction, withVisionControlSourceMarkers } from "@vision-control/next-react";
import { describe, expect, it } from "vitest";

const NEXT_BUILD_DIR = join(process.cwd(), ".next");

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const collectFiles = (dir: string, exts: readonly string[]): string[] => {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (isDirectory(full)) {
      results.push(...collectFiles(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
};

const grepInFiles = (
  files: readonly string[],
  pattern: RegExp,
): { file: string; count: number }[] => {
  const hits: { file: string; count: number }[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const globalRe = new RegExp(pattern.source, "g");
    const matches = content.match(globalRe);
    if (matches !== null && matches.length > 0) {
      hits.push({ file, count: matches.length });
    }
  }
  return hits;
};

describe("production marker safety (ADR-008)", () => {
  it("isNextProduction is true under NODE_ENV=production", () => {
    expect(isNextProduction(undefined, { NODE_ENV: "production" })).toBe(true);
  });

  it("withVisionControlSourceMarkers returns config unchanged in production", () => {
    const config = { reactStrictMode: true };
    const wrapped = withVisionControlSourceMarkers(config, { production: true });
    expect(wrapped).toBe(config);
  });

  it("next build output contains ZERO data-vc-source markers", () => {
    if (!isDirectory(NEXT_BUILD_DIR)) {
      throw new Error(
        '.next/ not found — run "pnpm nx run playground-next:build" before this test',
      );
    }

    const jsFiles = collectFiles(NEXT_BUILD_DIR, [".js", ".mjs", ".html"]);
    expect(jsFiles.length).toBeGreaterThan(0);

    const markerHits = grepInFiles(jsFiles, /data-vc-source/);
    expect(markerHits).toEqual([]);
  });

  it("next build output contains ZERO vision-control source-id tokens", () => {
    if (!isDirectory(NEXT_BUILD_DIR)) {
      throw new Error(
        '.next/ not found — run "pnpm nx run playground-next:build" before this test',
      );
    }

    const jsFiles = collectFiles(NEXT_BUILD_DIR, [".js", ".mjs"]);
    const tokenHits = grepInFiles(jsFiles, /vc-source|vision-control-source/);
    expect(tokenHits).toEqual([]);
  });

  it("next build server HTML contains ZERO vc-source attributes", () => {
    if (!isDirectory(NEXT_BUILD_DIR)) {
      throw new Error(
        '.next/ not found — run "pnpm nx run playground-next:build" before this test',
      );
    }

    const htmlFiles = collectFiles(NEXT_BUILD_DIR, [".html"]);
    const attrHits = grepInFiles(htmlFiles, /vc-source/i);
    expect(attrHits).toEqual([]);
  });
});
