import { describe, expect, it } from "vitest";

import {
  type AlignmentAccessibilityWarning,
  assertReadingOrderPreserved,
  detectCssOrderPresent,
  detectCssOrderUsage,
  detectDomVisualOrderDesync,
} from "./alignment-accessibility.js";

describe("alignment-accessibility — CSS order desync detection (PRD §2003)", () => {
  it("returns null when all order values are zero (no reorder)", () => {
    expect(detectCssOrderUsage([0, 0, 0, 0])).toBeNull();
  });

  it("returns null when all order values are equal but non-zero (stable order)", () => {
    expect(detectCssOrderUsage([5, 5, 5])).toBeNull();
  });

  it("returns null for a single element", () => {
    expect(detectCssOrderUsage([3])).toBeNull();
  });

  it("warns when order values produce a visual reorder", () => {
    // DOM order A,B,C with orders [2,0,1] -> visual order B,C,A (desync).
    const warning = detectCssOrderUsage([2, 0, 1]);
    expect(warning).not.toBeNull();
    if (warning) {
      expect(warning.code).toBe("dom-visual-order-desync");
      expect(warning.level).toBe("warn");
      expect(warning.message).toMatch(/order/i);
      expect(warning.remediation.length).toBeGreaterThan(0);
    }
  });

  it("does not warn when ascending order values match DOM order (no reorder)", () => {
    // orders [0,1,2] keep DOM order -> visual order == DOM order.
    expect(detectCssOrderUsage([0, 1, 2])).toBeNull();
  });

  it("warns when descending order values reverse the visual sequence", () => {
    const warning = detectCssOrderUsage([2, 1, 0]);
    expect(warning).not.toBeNull();
    expect(warning?.code).toBe("dom-visual-order-desync");
  });
});

describe("alignment-accessibility — DOM-vs-visual desync detection", () => {
  it("returns null when DOM order matches visual order", () => {
    expect(detectDomVisualOrderDesync(["a", "b", "c"], ["a", "b", "c"])).toBeNull();
  });

  it("warns when visual order diverges from DOM order", () => {
    const warning = detectDomVisualOrderDesync(["a", "b", "c"], ["c", "a", "b"]);
    expect(warning).not.toBeNull();
    expect(warning?.code).toBe("dom-visual-order-desync");
    expect(warning?.level).toBe("warn");
  });

  it("returns null for mismatched lengths (no assertion possible)", () => {
    expect(detectDomVisualOrderDesync(["a", "b"], ["a"])).toBeNull();
  });

  it("returns null for fewer than two elements", () => {
    expect(detectDomVisualOrderDesync(["a"], ["a"])).toBeNull();
  });
});

describe("alignment-accessibility — css-order-present advisory", () => {
  it("returns null when no order values are set", () => {
    expect(detectCssOrderPresent([0, 0, 0])).toBeNull();
  });

  it("promotes to a warn when order values cause a desync", () => {
    const warning = detectCssOrderPresent([1, 0, 2]);
    expect(warning?.level).toBe("warn");
    expect(warning?.code).toBe("dom-visual-order-desync");
  });

  it("returns an info advisory when order is set but currently harmless", () => {
    // all equal non-zero: present but no reorder.
    const warning = detectCssOrderPresent([7, 7, 7]);
    expect(warning?.level).toBe("info");
    expect(warning?.code).toBe("css-order-present");
  });
});

describe("alignment-accessibility — reading-order assertion (verification gate)", () => {
  it("passes when DOM order matches visual order", () => {
    const result = assertReadingOrderPreserved(
      ["btn-a", "btn-b", "btn-c"],
      ["btn-a", "btn-b", "btn-c"],
    );
    expect(result.name).toBe("reading-order-preserved");
    expect(result.passed).toBe(true);
  });

  it("fails when visual order diverges from DOM order", () => {
    const result = assertReadingOrderPreserved(
      ["btn-a", "btn-b", "btn-c"],
      ["btn-c", "btn-a", "btn-b"],
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/diverg/i);
    expect(result.expected).toBe("btn-a -> btn-b -> btn-c");
    expect(result.actual).toBe("btn-c -> btn-a -> btn-b");
  });

  it("fails on length mismatch", () => {
    const result = assertReadingOrderPreserved(["a", "b"], ["a", "b", "c"]);
    expect(result.passed).toBe(false);
  });

  it("fails on empty input (nothing to verify)", () => {
    const result = assertReadingOrderPreserved([], []);
    expect(result.passed).toBe(false);
  });
});

describe("alignment-accessibility — warning is non-blocking by shape", () => {
  it("every warning exposes a level field (warn/info, never 'error')", () => {
    const cases: AlignmentAccessibilityWarning[] = [
      detectCssOrderUsage([1, 0, 2]),
      detectDomVisualOrderDesync(["a", "b"], ["b", "a"]),
      detectCssOrderPresent([7, 7]),
    ].filter((w): w is AlignmentAccessibilityWarning => w !== null);
    for (const w of cases) {
      expect(w.level === "warn" || w.level === "info").toBe(true);
    }
  });
});
