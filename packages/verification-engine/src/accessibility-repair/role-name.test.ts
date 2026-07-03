import { describe, expect, it } from "vitest";

import { detectRoleNameIssues, hasAccessibleName, type RoleNameElement } from "./role-name.js";

const el = (over: Partial<RoleNameElement> = {}): RoleNameElement => ({
  tagName: "button",
  ...over,
});

describe("role-name — missing accessible name", () => {
  it("flags an interactive button with no name source", () => {
    const out = detectRoleNameIssues([el({ tagName: "button" })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("missing-accessible-name");
    expect(out[0]?.level).toBe("warn");
    expect(out[0]?.verificationAssertion.name).toBe("accessible-name");
  });

  it("does not flag a button with visible text", () => {
    expect(detectRoleNameIssues([el({ tagName: "button", text: "Save" })])).toEqual([]);
  });

  it("does not flag a button with an aria-label", () => {
    expect(detectRoleNameIssues([el({ tagName: "button", ariaLabel: "Save" })])).toEqual([]);
  });

  it("does not flag a non-interactive element with no name", () => {
    expect(detectRoleNameIssues([el({ tagName: "div" })])).toEqual([]);
  });

  it("does not flag an input of type hidden (labelable but not interactive here)", () => {
    expect(detectRoleNameIssues([el({ tagName: "span" })])).toEqual([]);
  });
});

describe("role-name — role contradicts implicit semantics", () => {
  it("surfaces an info when an explicit role overrides the implicit role", () => {
    const out = detectRoleNameIssues([el({ tagName: "button", role: "link", text: "Go" })]);
    const override = out.find((s) => s.code === "role-contradicts-implicit");
    expect(override).toBeDefined();
    expect(override?.level).toBe("info");
    expect(override?.verificationAssertion.name).toBe("role");
  });

  it("does not surface when the explicit role matches the implicit role", () => {
    expect(detectRoleNameIssues([el({ tagName: "button", role: "button", text: "Save" })])).toEqual(
      [],
    );
  });
});

describe("role-name — hasAccessibleName predicate", () => {
  it("treats whitespace-only text as no name", () => {
    expect(hasAccessibleName(el({ tagName: "button", text: "   " }))).toBe(false);
  });

  it("treats aria-labelledby as a name source", () => {
    expect(hasAccessibleName(el({ tagName: "button", ariaLabelledby: "lbl" }))).toBe(true);
  });

  it("returns false for an element with no name sources", () => {
    expect(hasAccessibleName(el({ tagName: "button" }))).toBe(false);
  });
});

describe("role-name — advisory contract (ADR-017)", () => {
  it("every suggestion carries a runnable verification assertion", () => {
    const out = detectRoleNameIssues([
      el({ tagName: "button" }),
      el({ tagName: "a", role: "button", text: "x" }),
    ]);
    for (const s of out) {
      expect(typeof s.verificationAssertion.run).toBe("function");
      expect(s.verificationAssertion.name.length).toBeGreaterThan(0);
    }
  });

  it("never emits a blocking (error) level — only warn/info", () => {
    const out = detectRoleNameIssues([
      el({ tagName: "button" }),
      el({ tagName: "nav", role: "main" }),
    ]);
    for (const s of out) {
      expect(s.level === "warn" || s.level === "info").toBe(true);
    }
  });
});
