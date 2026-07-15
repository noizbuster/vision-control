import { describe, expect, it } from "vitest";

import { mergeOriginResults } from "./merge-origin-results.js";
import type { MapOrigin } from "./types.js";

const cssOrigin = (path: string): MapOrigin => ({
  relativePath: path,
  confidence: "high",
  kind: "css",
  warnings: [],
  startLine: 1,
  endLine: 2,
});

const jsOrigin = (path: string): MapOrigin => ({
  relativePath: path,
  confidence: "medium",
  kind: "js",
  warnings: ["module-path-only"],
});

describe("mergeOriginResults", () => {
  it("returns empty origins and false truncation when given no results", () => {
    // Given: no resolve passes
    // When: merge
    const merged = mergeOriginResults([]);
    // Then: empty is valid for snapshot compile
    expect(merged.origins).toEqual([]);
    expect(merged.originsTruncated).toBe(false);
  });

  it("concatenates CSS then JS origins in call order", () => {
    const merged = mergeOriginResults([
      { origins: [cssOrigin("Button.module.css")], originsTruncated: false },
      { origins: [jsOrigin("src/Button.tsx")], originsTruncated: false },
    ]);
    expect(merged.origins).toHaveLength(2);
    expect(merged.origins[0]?.kind).toBe("css");
    expect(merged.origins[1]?.kind).toBe("js");
    expect(merged.originsTruncated).toBe(false);
  });

  it("sets originsTruncated when any pass truncated", () => {
    const merged = mergeOriginResults([
      { origins: [cssOrigin("a.css")], originsTruncated: false },
      { origins: [jsOrigin("b.ts")], originsTruncated: true },
    ]);
    expect(merged.origins).toHaveLength(2);
    expect(merged.originsTruncated).toBe(true);
  });

  it("preserves empty origins from a truncated pass", () => {
    const merged = mergeOriginResults([{ origins: [], originsTruncated: true }]);
    expect(merged.origins).toEqual([]);
    expect(merged.originsTruncated).toBe(true);
  });
});
