import { describe, expect, it } from "vitest";

import {
  detectLabelControlIssues,
  hasAccessibleNameSource,
  type LabelControlElement,
} from "./label-control.js";

const ctrl = (over: Partial<LabelControlElement> = {}): LabelControlElement => ({
  tagName: "input",
  ...over,
});

describe("label-control — missing association", () => {
  it("flags a text input with no label, id, or aria", () => {
    const out = detectLabelControlIssues([ctrl({ tagName: "input", type: "text" })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("missing-label-control-association");
    expect(out[0]?.level).toBe("warn");
    expect(out[0]?.verificationAssertion.name).toBe("attribute-present:aria-label");
  });

  it("does not flag a control with an associated label (adapter-resolved)", () => {
    expect(detectLabelControlIssues([ctrl({ tagName: "input", associatedLabel: true })])).toEqual(
      [],
    );
  });

  it("does not flag a control with an aria-label", () => {
    expect(detectLabelControlIssues([ctrl({ tagName: "input", ariaLabel: "Email" })])).toEqual([]);
  });

  it("does not flag a control with aria-labelledby", () => {
    expect(
      detectLabelControlIssues([ctrl({ tagName: "input", ariaLabelledby: "email-lbl" })]),
    ).toEqual([]);
  });

  it("does not flag a hidden input", () => {
    expect(detectLabelControlIssues([ctrl({ tagName: "input", type: "hidden" })])).toEqual([]);
  });

  it("ignores non-labelable tags", () => {
    expect(detectLabelControlIssues([ctrl({ tagName: "div" })])).toEqual([]);
  });

  it("flags a select and a textarea without labels", () => {
    const out = detectLabelControlIssues([
      ctrl({ tagName: "select" }),
      ctrl({ tagName: "textarea", name: "bio" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]?.message).toContain('name="bio"');
  });
});

describe("label-control — hasAccessibleNameSource predicate", () => {
  it("returns true when associatedLabel is set", () => {
    expect(hasAccessibleNameSource(ctrl({ associatedLabel: true }))).toBe(true);
  });

  it("returns false for an anonymous control", () => {
    expect(hasAccessibleNameSource(ctrl({}))).toBe(false);
  });
});

describe("label-control — advisory contract (ADR-017)", () => {
  it("every suggestion carries a runnable verification assertion and non-blocking level", () => {
    const out = detectLabelControlIssues([ctrl({ tagName: "input" })]);
    for (const s of out) {
      expect(typeof s.verificationAssertion.run).toBe("function");
      expect(s.level === "warn" || s.level === "info").toBe(true);
    }
  });
});
