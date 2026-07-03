/**
 * Screenshot diff assertion tests for the visual-regression-lab fixtures
 * (VC-V1V2-15). Exercises `assertScreenshotSimilarity` against the deterministic
 * before/after crop fixtures to confirm the diff assertion behaves correctly
 * for the regression-harness use case (before/after a source patch).
 */

import { assertScreenshotSimilarity } from "@vision-control/verification-engine";
import { describe, expect, it } from "vitest";

import {
  AFTER_IDENTICAL,
  AFTER_NEAR_MATCH,
  AFTER_TOTAL_CHANGE,
  BEFORE_CROP,
  FIXTURE_REGION_LABEL,
} from "./screenshot-diff.fixture.js";

describe("visual-regression-lab screenshot diff fixtures", () => {
  it("exposes a stable fixture region label", () => {
    expect(FIXTURE_REGION_LABEL).toBe("login-card");
  });

  it("passes when before/after crops are identical (same hash)", () => {
    const result = assertScreenshotSimilarity(BEFORE_CROP, AFTER_IDENTICAL);
    expect(result.verdict).toBe("pass");
    expect(result.identicalHash).toBe(true);
    expect(result.similarity).toBe(1);
  });

  it("passes a near-match crop under a lenient threshold", () => {
    const result = assertScreenshotSimilarity(BEFORE_CROP, AFTER_NEAR_MATCH, {
      threshold: 0.8,
    });
    expect(result.verdict).toBe("pass");
    expect(result.similarity).toBeCloseTo(0.875, 5);
  });

  it("fails a near-match crop under the strict default threshold", () => {
    const result = assertScreenshotSimilarity(BEFORE_CROP, AFTER_NEAR_MATCH);
    expect(result.verdict).toBe("fail");
    expect(result.threshold).toBe(0.95);
  });

  it("fails a total-change crop", () => {
    const result = assertScreenshotSimilarity(BEFORE_CROP, AFTER_TOTAL_CHANGE, {
      threshold: 0.5,
    });
    expect(result.verdict).toBe("fail");
    expect(result.similarity).toBe(0);
    expect(result.identicalHash).toBe(false);
  });
});
