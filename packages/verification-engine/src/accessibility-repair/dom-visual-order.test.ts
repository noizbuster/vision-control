import { describe, expect, it } from "vitest";

import { type DomVisualOrderInput, detectDomVisualOrderIssues } from "./dom-visual-order.js";

describe("dom-visual-order — CSS order desync", () => {
  it("flags a CSS order array that produces a visual reorder", () => {
    const input: DomVisualOrderInput = { cssOrder: [2, 0, 1] };
    const out = detectDomVisualOrderIssues(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("dom-visual-order-desync");
    expect(out[0]?.level).toBe("warn");
    expect(out[0]?.verificationAssertion.name).toBe("css-order-removed");
  });

  it("does not flag an all-zero CSS order (no reorder)", () => {
    expect(detectDomVisualOrderIssues({ cssOrder: [0, 0, 0] })).toEqual([]);
  });

  it("does not flag ascending order matching DOM order", () => {
    expect(detectDomVisualOrderIssues({ cssOrder: [0, 1, 2] })).toEqual([]);
  });
});

describe("dom-visual-order — generic DOM/visual desync", () => {
  it("flags when visual order diverges from DOM order", () => {
    const out = detectDomVisualOrderIssues({
      domOrder: ["a", "b", "c"],
      visualOrder: ["c", "a", "b"],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("dom-visual-order-desync");
  });

  it("does not flag when DOM and visual order agree", () => {
    expect(
      detectDomVisualOrderIssues({
        domOrder: ["a", "b"],
        visualOrder: ["a", "b"],
      }),
    ).toEqual([]);
  });
});

describe("dom-visual-order — combined input", () => {
  it("emits one suggestion per detected desync mechanism", () => {
    // Both a CSS-order desync AND a generic DOM/visual desync are present.
    const out = detectDomVisualOrderIssues({
      cssOrder: [1, 0],
      domOrder: ["a", "b"],
      visualOrder: ["b", "a"],
    });
    expect(out.length).toBe(2);
    expect(out.every((s) => s.code === "dom-visual-order-desync")).toBe(true);
  });
});

describe("dom-visual-order — advisory contract (ADR-017)", () => {
  it("every suggestion is warn-level and carries a runnable assertion", () => {
    const out = detectDomVisualOrderIssues({
      cssOrder: [2, 0, 1],
      domOrder: ["a", "b", "c"],
      visualOrder: ["b", "c", "a"],
    });
    for (const s of out) {
      expect(s.level).toBe("warn");
      expect(typeof s.verificationAssertion.run).toBe("function");
    }
  });
});
