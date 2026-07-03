import { describe, expect, it } from "vitest";

import {
  type AccessibilityScan,
  buildAccessibleNameAssertion,
  buildAttributePresentAssertion,
  buildFocusableAssertion,
  buildRoleAssertion,
  collectAccessibilitySuggestions,
  summarizeSuggestions,
} from "./suggested-fixes.js";

/** Minimal fake target + adapter so assertion builders can be exercised at runtime. */
function fakeTarget(attrs: Record<string, string | null> = {}, style: Record<string, string> = {}) {
  const element = { tagName: "DIV" as const };
  const dom = {
    getAttribute: (_e: unknown, name: string) => (name in attrs ? (attrs[name] as string) : null),
    getText: (_e: unknown) => attrs["data-text"] ?? "",
    getStyle: (_e: unknown, prop: string) => style[prop] ?? "",
  };
  return {
    element: element as unknown as Element,
    dom: dom as never,
    runtimeId: "r",
    confidence: "low" as const,
  };
}

describe("suggested-fixes — assertion builders", () => {
  it("buildAttributePresentAssertion passes when the attribute is present", () => {
    const a = buildAttributePresentAssertion("aria-label");
    const res = a.run(fakeTarget({ "aria-label": "Save" }));
    expect(res.passed).toBe(true);
  });

  it("buildAttributePresentAssertion fails when the attribute is absent", () => {
    const a = buildAttributePresentAssertion("aria-label");
    const res = a.run(fakeTarget({}));
    expect(res.passed).toBe(false);
    expect(res.actual).toBe("<absent>");
  });

  it("buildAttributePresentAssertion fails when the attribute is empty", () => {
    const a = buildAttributePresentAssertion("aria-label");
    const res = a.run(fakeTarget({ "aria-label": "" }));
    expect(res.passed).toBe(false);
  });

  it("buildAttributePresentAssertion checks a specific value when given", () => {
    const a = buildAttributePresentAssertion("tabindex", "0");
    expect(a.run(fakeTarget({ tabindex: "0" })).passed).toBe(true);
    expect(a.run(fakeTarget({ tabindex: "1" })).passed).toBe(false);
  });

  it("buildAccessibleNameAssertion matches aria-label first", () => {
    const a = buildAccessibleNameAssertion("Save");
    const res = a.run(fakeTarget({ "aria-label": "Save" }));
    expect(res.passed).toBe(true);
  });

  it("buildRoleAssertion delegates to assertRole", () => {
    const a = buildRoleAssertion("button");
    const res = a.run(fakeTarget({ role: "button" }));
    expect(res.passed).toBe(true);
  });

  it("buildFocusableAssertion passes for a focusable target", () => {
    const a = buildFocusableAssertion();
    expect(a.run(fakeTarget({ tabindex: "0" })).passed).toBe(true);
  });

  it("buildFocusableAssertion fails for a non-focusable target", () => {
    const a = buildFocusableAssertion();
    expect(a.run(fakeTarget({ inert: "" })).passed).toBe(false);
  });
});

describe("suggested-fixes — collectAccessibilitySuggestions aggregation", () => {
  it("runs every supplied detector and aggregates suggestions", () => {
    const scan: AccessibilityScan = {
      roleName: [{ tagName: "button" }],
      labelControl: [{ tagName: "input", type: "text" }],
      focusOrder: [
        { id: "a", tagName: "button", tabindex: "2" },
        { id: "b", tagName: "button", tabindex: "1" },
      ],
      domVisualOrder: { cssOrder: [2, 0, 1] },
      keyboardNavigation: [{ tagName: "div", hasClickHandler: true }],
    };
    const out = collectAccessibilitySuggestions(scan);
    // At least one from each of the 5 detectors.
    const codes = new Set(out.map((s) => s.code));
    expect(codes.has("missing-accessible-name")).toBe(true);
    expect(codes.has("missing-label-control-association")).toBe(true);
    expect(codes.has("focus-order-diverges-from-dom")).toBe(true);
    expect(codes.has("dom-visual-order-desync")).toBe(true);
    expect(codes.has("clickable-widget-not-keyboard-accessible")).toBe(true);
  });

  it("returns no suggestions for an empty scan", () => {
    expect(collectAccessibilitySuggestions({})).toEqual([]);
  });

  it("runs a partial scan (only the sections supplied)", () => {
    const out = collectAccessibilitySuggestions({
      roleName: [{ tagName: "button" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("missing-accessible-name");
  });
});

describe("suggested-fixes — summarizeSuggestions", () => {
  it("counts total/warn/info", () => {
    const out = collectAccessibilitySuggestions({
      roleName: [{ tagName: "button" }],
      keyboardNavigation: [{ tagName: "div", hasClickHandler: true, tabindex: "0" }],
    });
    const summary = summarizeSuggestions(out);
    expect(summary.total).toBe(out.length);
    expect(summary.warn + summary.info).toBe(summary.total);
  });
});

describe("suggested-fixes — adversarial: suggestion never mutates", () => {
  it("collectAccessibilitySuggestions returns plain data with no side effects", () => {
    const scan: AccessibilityScan = { roleName: [{ tagName: "button" }] };
    const before = JSON.parse(JSON.stringify(scan));
    const out = collectAccessibilitySuggestions(scan);
    expect(scan).toEqual(before); // input untouched
    expect(Array.isArray(out)).toBe(true);
  });

  it("every suggestion exposes only advisory levels (warn/info), never error", () => {
    const out = collectAccessibilitySuggestions({
      roleName: [{ tagName: "button" }, { tagName: "nav", role: "main" }],
      keyboardNavigation: [{ tagName: "div", hasClickHandler: true }],
    });
    for (const s of out) {
      expect(s.level === "warn" || s.level === "info").toBe(true);
      expect(s.message.length).toBeGreaterThan(0);
      expect(s.remediation.length).toBeGreaterThan(0);
      expect(typeof s.verificationAssertion.run).toBe("function");
    }
  });
});
