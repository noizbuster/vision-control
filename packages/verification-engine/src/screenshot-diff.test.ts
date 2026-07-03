/**
 * screenshot-diff tests (VC-V1V2-15).
 *
 * Optional similarity diff between two crops (e.g. before/after a source
 * patch). The V1 assertion is hash-exact plus a dependency-free byte-similarity
 * ratio; perceptual diff is a future enhancement, documented as such.
 */

import { describe, expect, it } from "vitest";

import {
  assertScreenshotSimilarity,
  byteSimilarity,
  type ScreenshotCropData,
} from "./screenshot-diff.js";

const crop = (bytes: number[], contentHash: string): ScreenshotCropData => ({
  bytes: new Uint8Array(bytes),
  contentHash,
});

describe("byteSimilarity", () => {
  it("returns 1 for two empty arrays", () => {
    expect(byteSimilarity(new Uint8Array([]), new Uint8Array([]))).toBe(1);
  });

  it("returns 1 for identical byte arrays", () => {
    expect(byteSimilarity(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(1);
  });

  it("returns 0 for completely disjoint same-length arrays", () => {
    expect(byteSimilarity(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]))).toBe(0);
  });

  it("normalizes by the longer array length", () => {
    // 3 of 4 bytes match -> 0.75
    expect(byteSimilarity(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3, 9]))).toBe(0.75);
  });
});

describe("assertScreenshotSimilarity", () => {
  it("passes with similarity 1 when content hashes match", () => {
    const result = assertScreenshotSimilarity(
      crop([1, 2, 3], "sha256:same"),
      crop([1, 2, 3], "sha256:same"),
    );
    expect(result.verdict).toBe("pass");
    expect(result.identicalHash).toBe(true);
    expect(result.similarity).toBe(1);
  });

  it("passes when similarity is at or above the threshold", () => {
    const result = assertScreenshotSimilarity(
      crop([1, 2, 3, 4], "sha256:a"),
      crop([1, 2, 3, 9], "sha256:b"),
      { threshold: 0.7 },
    );
    expect(result.verdict).toBe("pass");
    expect(result.identicalHash).toBe(false);
    expect(result.similarity).toBeCloseTo(0.75, 5);
  });

  it("fails when similarity drops below the threshold", () => {
    const result = assertScreenshotSimilarity(
      crop([1, 2, 3, 4], "sha256:a"),
      crop([9, 9, 9, 9], "sha256:b"),
      { threshold: 0.5 },
    );
    expect(result.verdict).toBe("fail");
    expect(result.similarity).toBe(0);
    expect(result.message).toContain("threshold");
  });

  it("uses the default threshold of 0.95 when none is given", () => {
    const result = assertScreenshotSimilarity(
      crop([1, 2, 3, 4], "sha256:a"),
      crop([1, 2, 3, 9], "sha256:b"),
    );
    expect(result.threshold).toBe(0.95);
    // 0.75 < 0.95 -> fail
    expect(result.verdict).toBe("fail");
  });

  it("reports identical-hash even when byte arrays differ (hash is authoritative)", () => {
    const result = assertScreenshotSimilarity(
      crop([1, 2, 3], "sha256:same"),
      crop([4, 5, 6], "sha256:same"),
    );
    expect(result.identicalHash).toBe(true);
    expect(result.similarity).toBe(1);
    expect(result.verdict).toBe("pass");
  });
});
