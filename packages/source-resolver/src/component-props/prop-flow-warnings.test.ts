import { describe, expect, it } from "vitest";

import { hasBlockingWarning, propFlowWarnings } from "./prop-flow-warnings.js";

describe("propFlowWarnings — same-component (no warnings)", () => {
  it("produces no warnings for same-component context", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "same-component",
    });
    expect(warnings).toEqual([]);
    expect(hasBlockingWarning(warnings)).toBe(false);
  });
});

describe("propFlowWarnings — reparented-or-moved", () => {
  it("produces a warning mentioning the reparented component", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "reparented-or-moved",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("prop-flow-reparented");
    expect(warnings[0]?.severity).toBe("warning");
    expect(warnings[0]?.message).toContain("Button");
    expect(warnings[0]?.message).toContain("variant");
    expect(hasBlockingWarning(warnings)).toBe(false);
  });
});

describe("propFlowWarnings — cross-boundary without opt-in (BLOCKING)", () => {
  it("produces an error warning for cross-boundary without opt-in", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "cross-boundary",
      boundary: "server-to-client",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.severity).toBe("error");
    expect(warnings[0]?.code).toBe("prop-flow-cross-boundary-no-opt-in");
    expect(hasBlockingWarning(warnings)).toBe(true);
  });

  it("mentions the boundary type in the message", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "cross-boundary",
      boundary: "context-provider",
    });
    expect(warnings[0]?.message).toContain("Context Provider");
  });

  it("mentions agent reasoning required when blocked", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "cross-boundary",
      boundary: "server-to-client",
    });
    expect(warnings[0]?.message.toLowerCase()).toContain("agent");
  });
});

describe("propFlowWarnings — cross-boundary WITH opt-in (info, not blocking)", () => {
  it("produces an info warning when boundaryOptIn is true", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "cross-boundary",
      boundary: "server-to-client",
      boundaryOptIn: true,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.severity).toBe("info");
    expect(warnings[0]?.code).toBe("prop-flow-cross-boundary-opted-in");
    expect(hasBlockingWarning(warnings)).toBe(false);
  });
});

describe("hasBlockingWarning", () => {
  it("returns false when there are no warnings", () => {
    expect(hasBlockingWarning([])).toBe(false);
  });

  it("returns false when all warnings are info or warning severity", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "reparented-or-moved",
    });
    expect(hasBlockingWarning(warnings)).toBe(false);
  });

  it("returns true when at least one warning is error severity", () => {
    const warnings = propFlowWarnings({
      componentName: "Button",
      propName: "variant",
      context: "cross-boundary",
      boundary: "server-to-client",
    });
    expect(hasBlockingWarning(warnings)).toBe(true);
  });
});
