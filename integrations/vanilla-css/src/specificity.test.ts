import { describe, expect, it } from "vitest";

import { computeSpecificity } from "./specificity.js";

describe("computeSpecificity", () => {
  it("class selector is (0,1,0)", () => {
    expect(computeSpecificity(".btn")).toBe("(0,1,0)");
  });

  it("id selector is (1,0,0)", () => {
    expect(computeSpecificity("#submit")).toBe("(1,0,0)");
  });

  it("type selector is (0,0,1)", () => {
    expect(computeSpecificity("div")).toBe("(0,0,1)");
  });

  it("compound id + class is (1,1,0)", () => {
    expect(computeSpecificity("#submit .btn")).toBe("(1,1,0)");
  });

  it("attribute selector contributes to b", () => {
    expect(computeSpecificity("input[type=text]")).toBe("(0,1,1)");
  });

  it("pseudo-class contributes to b", () => {
    expect(computeSpecificity("a:hover")).toBe("(0,1,1)");
  });

  it("double-colon pseudo-element contributes to c", () => {
    expect(computeSpecificity(".card::before")).toBe("(0,1,1)");
  });

  it("legacy single-colon pseudo-element contributes to c", () => {
    expect(computeSpecificity(".card:before")).toBe("(0,1,1)");
  });

  it("universal selector contributes nothing", () => {
    expect(computeSpecificity("*")).toBe("(0,0,0)");
  });

  it("comma list uses the first member", () => {
    // ".btn, #x" — spec: both share the specificity of each; we report first.
    expect(computeSpecificity(".btn, #x")).toBe("(0,1,0)");
  });

  it("empty selector is (0,0,0)", () => {
    expect(computeSpecificity("")).toBe("(0,0,0)");
    expect(computeSpecificity("   ")).toBe("(0,0,0)");
  });
});
