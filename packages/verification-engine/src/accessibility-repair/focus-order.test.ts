import { describe, expect, it } from "vitest";

import { detectFocusOrderIssues, type FocusOrderElement, parseTabindex } from "./focus-order.js";

const f = (id: string, over: Partial<FocusOrderElement> = {}): FocusOrderElement => ({
  id,
  tagName: "button",
  ...over,
});

describe("focus-order — parseTabindex", () => {
  it("parses a positive integer", () => {
    expect(parseTabindex("3")).toBe(3);
  });
  it("parses -1 and 0", () => {
    expect(parseTabindex("-1")).toBe(-1);
    expect(parseTabindex("0")).toBe(0);
  });
  it("returns undefined for absent or non-numeric", () => {
    expect(parseTabindex(undefined)).toBeUndefined();
    expect(parseTabindex("")).toBeUndefined();
    expect(parseTabindex("abc")).toBeUndefined();
  });
});

describe("focus-order — divergence detection", () => {
  it("does not flag a sequence with no positive tabindex (DOM order)", () => {
    expect(
      detectFocusOrderIssues([f("a", { tabindex: "0" }), f("b", { tabindex: "0" }), f("c")]),
    ).toEqual([]);
  });

  it("flags when positive tabindex reorders the sequence away from DOM order", () => {
    // DOM: a(0) b(1) c(2) with tabindex a=3 b=1 c=2 -> sorted by tab: b,c,a (diverged)
    const out = detectFocusOrderIssues([
      f("a", { tabindex: "3" }),
      f("b", { tabindex: "1" }),
      f("c", { tabindex: "2" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("focus-order-diverges-from-dom");
    expect(out[0]?.level).toBe("warn");
  });

  it("does not flag when positive tabindex values keep DOM order", () => {
    expect(
      detectFocusOrderIssues([
        f("a", { tabindex: "1" }),
        f("b", { tabindex: "2" }),
        f("c", { tabindex: "3" }),
      ]),
    ).toEqual([]);
  });

  it("surfaces interactive elements removed from the tab sequence (tabindex=-1)", () => {
    const out = detectFocusOrderIssues([f("a"), f("b", { tabindex: "-1", isInteractive: true })]);
    const removed = out.find((s) => s.code === "interactive-element-removed-from-tab-sequence");
    expect(removed).toBeDefined();
    expect(removed?.level).toBe("info");
  });

  it("returns nothing for fewer than two elements", () => {
    expect(detectFocusOrderIssues([f("a", { tabindex: "5" })])).toEqual([]);
  });
});

describe("focus-order — advisory contract (ADR-017)", () => {
  it("every suggestion is non-blocking and carries a runnable assertion", () => {
    const out = detectFocusOrderIssues([
      f("a", { tabindex: "2" }),
      f("b", { tabindex: "1" }),
      f("c", { tabindex: "-1", isInteractive: true }),
    ]);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(typeof s.verificationAssertion.run).toBe("function");
      expect(s.level === "warn" || s.level === "info").toBe(true);
    }
  });
});
