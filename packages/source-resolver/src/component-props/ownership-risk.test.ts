import { describe, expect, it } from "vitest";
import { assessOwnershipRisk } from "./ownership-risk.js";
import type { DiscoveredProp } from "./prop-discovery.js";

const literalProp: DiscoveredProp = {
  name: "variant",
  kind: "literal-string",
  rawValue: "secondary",
  literalValue: "secondary",
};

describe("assessOwnershipRisk — same-component (HIGH)", () => {
  it("returns HIGH risk for same-component literal prop", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "same-component",
    });
    expect(result.risk).toBe("high");
    expect(result.deterministicSafe).toBe(true);
    expect(result.boundary).toBe("none");
    expect(result.reason).toContain("original location");
  });
});

describe("assessOwnershipRisk — reparented-or-moved (MEDIUM)", () => {
  it("returns MEDIUM risk for reparented-or-moved context", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "reparented-or-moved",
    });
    expect(result.risk).toBe("medium");
    expect(result.deterministicSafe).toBe(true);
    expect(result.reason).toContain("reparented");
  });

  it("does NOT block deterministic suggestions for reparented (still safe)", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "reparented-or-moved",
    });
    expect(result.deterministicSafe).toBe(true);
  });
});

describe("assessOwnershipRisk — cross-boundary without opt-in (LOW, blocked)", () => {
  it("returns LOW risk and deterministicSafe:false for cross-boundary without opt-in", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "cross-boundary",
      boundary: "server-to-client",
    });
    expect(result.risk).toBe("low");
    expect(result.deterministicSafe).toBe(false);
    expect(result.reason).toContain("Server Component");
    expect(result.reason).toContain("Client Component");
  });

  it("produces a warning mentioning serialization for server-to-client", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "cross-boundary",
      boundary: "server-to-client",
    });
    expect(result.reason.toLowerCase()).toContain("serialization");
  });

  it("produces a warning for context-provider boundary", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "cross-boundary",
      boundary: "context-provider",
    });
    expect(result.reason).toContain("Context Provider");
    expect(result.reason.toLowerCase()).toContain("consumers");
  });

  it("produces a warning for client-to-server boundary", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "cross-boundary",
      boundary: "client-to-server",
    });
    expect(result.reason).toContain("Client Component");
    expect(result.reason).toContain("Server Component");
  });
});

describe("assessOwnershipRisk — cross-boundary WITH opt-in (MEDIUM, safe)", () => {
  it("returns MEDIUM risk and deterministicSafe:true when boundaryOptIn is true", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "cross-boundary",
      boundary: "server-to-client",
      boundaryOptIn: true,
    });
    expect(result.risk).toBe("medium");
    expect(result.deterministicSafe).toBe(true);
    expect(result.reason).toContain("opted in");
  });
});

describe("assessOwnershipRisk — default boundary", () => {
  it("defaults to context-provider boundary when not specified", () => {
    const result = assessOwnershipRisk({
      prop: literalProp,
      context: "cross-boundary",
    });
    expect(result.boundary).toBe("context-provider");
  });
});
