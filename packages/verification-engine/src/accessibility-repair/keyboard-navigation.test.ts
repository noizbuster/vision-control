import { describe, expect, it } from "vitest";

import {
  detectKeyboardNavigationIssues,
  isKeyboardFocusable,
  type KeyboardNavigationElement,
} from "./keyboard-navigation.js";

const k = (over: Partial<KeyboardNavigationElement> = {}): KeyboardNavigationElement => ({
  tagName: "div",
  ...over,
});

describe("keyboard-navigation — clickable widget not keyboard-accessible", () => {
  it("flags a div with a click handler and no tabindex/role", () => {
    const out = detectKeyboardNavigationIssues([k({ tagName: "div", hasClickHandler: true })]);
    const code = out.find((s) => s.code === "clickable-widget-not-keyboard-accessible");
    expect(code).toBeDefined();
    expect(code?.level).toBe("warn");
    expect(code?.verificationAssertion.name).toBe("keyboard-focusable");
  });

  it("does not flag a div with a click handler, tabindex=0, and a role", () => {
    expect(
      detectKeyboardNavigationIssues([
        k({ tagName: "div", hasClickHandler: true, tabindex: "0", role: "button" }),
      ]),
    ).toEqual([]);
  });

  it("does not flag a native button even with a click handler", () => {
    expect(
      detectKeyboardNavigationIssues([k({ tagName: "button", hasClickHandler: true })]),
    ).toEqual([]);
  });
});

describe("keyboard-navigation — link without href", () => {
  it("flags an <a> without href", () => {
    const out = detectKeyboardNavigationIssues([k({ tagName: "a" })]);
    expect(out.find((s) => s.code === "link-without-href-not-focusable")).toBeDefined();
  });

  it("does not flag an <a> with href", () => {
    expect(detectKeyboardNavigationIssues([k({ tagName: "a", href: "#" })])).toEqual([]);
  });
});

describe("keyboard-navigation — missing role on custom widget", () => {
  it("surfaces a missing-role info for a clickable custom widget", () => {
    const out = detectKeyboardNavigationIssues([
      k({ tagName: "div", hasClickHandler: true, tabindex: "0" }),
    ]);
    const missing = out.find((s) => s.code === "interactive-widget-missing-role");
    expect(missing).toBeDefined();
    expect(missing?.level).toBe("info");
  });

  it("does not surface missing role when a role is set", () => {
    expect(
      detectKeyboardNavigationIssues([
        k({ tagName: "div", hasClickHandler: true, tabindex: "0", role: "button" }),
      ]),
    ).toEqual([]);
  });
});

describe("keyboard-navigation — isKeyboardFocusable predicate", () => {
  it("a native button is focusable", () => {
    expect(isKeyboardFocusable(k({ tagName: "button" }))).toBe(true);
  });
  it("an <a> with href is focusable", () => {
    expect(isKeyboardFocusable(k({ tagName: "a", href: "/x" }))).toBe(true);
  });
  it("an <a> without href is not focusable", () => {
    expect(isKeyboardFocusable(k({ tagName: "a" }))).toBe(false);
  });
  it("a div with tabindex=0 is focusable", () => {
    expect(isKeyboardFocusable(k({ tagName: "div", tabindex: "0" }))).toBe(true);
  });
  it("a div with tabindex=-1 is not focusable", () => {
    expect(isKeyboardFocusable(k({ tagName: "div", tabindex: "-1" }))).toBe(false);
  });
  it("a plain div is not focusable", () => {
    expect(isKeyboardFocusable(k({ tagName: "div" }))).toBe(false);
  });
});

describe("keyboard-navigation — advisory contract (ADR-017)", () => {
  it("every suggestion is non-blocking and carries a runnable assertion", () => {
    const out = detectKeyboardNavigationIssues([
      k({ tagName: "div", hasClickHandler: true }),
      k({ tagName: "a" }),
    ]);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(typeof s.verificationAssertion.run).toBe("function");
      expect(s.level === "warn" || s.level === "info").toBe(true);
    }
  });
});
