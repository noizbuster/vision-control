import { describe, expect, it } from "vitest";

import { isValidChild, validateReparent } from "./index.js";

describe("content model guards", () => {
  it("allows li into ul/ol", () => {
    expect(isValidChild("ul", "li")).toBe(true);
    expect(isValidChild("ol", "li")).toBe(true);
  });

  it("BLOCKS a div dropped directly into a ul (INVALID_DROP_TARGET)", () => {
    const result = validateReparent("ul", "div");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violation.code).toBe("INVALID_DROP_TARGET");
      expect(result.violation.parent).toBe("ul");
      expect(result.violation.child).toBe("div");
      expect(result.violation.reason).toMatch(/li/);
    }
  });

  it("validates the table family", () => {
    expect(isValidChild("table", "tbody")).toBe(true);
    expect(isValidChild("table", "thead")).toBe(true);
    expect(isValidChild("table", "tr")).toBe(true);
    // td belongs in tr, not directly in table
    expect(isValidChild("table", "td")).toBe(false);
    expect(isValidChild("tbody", "tr")).toBe(true);
    expect(isValidChild("tr", "td")).toBe(true);
    expect(isValidChild("tr", "th")).toBe(true);
    expect(isValidChild("tr", "div")).toBe(false);
  });

  it("validates select/option", () => {
    expect(isValidChild("select", "option")).toBe(true);
    expect(isValidChild("select", "optgroup")).toBe(true);
    expect(isValidChild("select", "div")).toBe(false);
    expect(isValidChild("optgroup", "option")).toBe(true);
  });

  it("validates dl/dt/dd", () => {
    expect(isValidChild("dl", "dt")).toBe(true);
    expect(isValidChild("dl", "dd")).toBe(true);
    expect(isValidChild("dl", "div")).toBe(false);
  });

  it("default parents accept flow content (permissive)", () => {
    expect(isValidChild("div", "span")).toBe(true);
    expect(isValidChild("section", "div")).toBe(true);
    expect(isValidChild("main", "article")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isValidChild("UL", "LI")).toBe(true);
    expect(isValidChild("Ul", "Div")).toBe(false);
    const result = validateReparent("UL", "DIV");
    expect(result.ok).toBe(false);
  });
});
