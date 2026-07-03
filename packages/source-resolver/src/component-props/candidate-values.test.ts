import { describe, expect, it } from "vitest";
import {
  candidateValuesFor,
  inferTypeMetadata,
  isValidCandidate,
  type PropTypeMetadata,
} from "./candidate-values.js";
import type { DiscoveredProp } from "./prop-discovery.js";

describe("candidateValuesFor — boolean", () => {
  const metadata: PropTypeMetadata = { type: "boolean" };

  it("produces exactly two candidates: true and false", () => {
    const result = candidateValuesFor(metadata);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.value)).toEqual(["true", "false"]);
    expect(result.constrained).toBe(true);
    expect(result.valueType).toBe("boolean");
  });
});

describe("candidateValuesFor — string-literal-union", () => {
  const metadata: PropTypeMetadata = {
    type: "string-literal-union",
    literals: ["primary", "secondary", "danger"],
  };

  it("produces the literal set as candidates", () => {
    const result = candidateValuesFor(metadata);
    expect(result.candidates.map((c) => c.value)).toEqual(["primary", "secondary", "danger"]);
    expect(result.constrained).toBe(true);
  });

  it("is unconstrained when the literal set is empty", () => {
    const result = candidateValuesFor({ type: "string-literal-union", literals: [] });
    expect(result.constrained).toBe(false);
    expect(result.candidates).toEqual([]);
  });
});

describe("candidateValuesFor — number-range", () => {
  it("produces step-based candidates from min to max", () => {
    const result = candidateValuesFor({ type: "number-range", min: 1, max: 5, step: 1 });
    expect(result.candidates.map((c) => c.value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(result.constrained).toBe(true);
  });

  it("produces a single candidate when min equals max", () => {
    const result = candidateValuesFor({ type: "number-range", min: 3, max: 3, step: 1 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.value).toBe("3");
    expect(result.constrained).toBe(false);
  });

  it("respects the step parameter", () => {
    const result = candidateValuesFor({ type: "number-range", min: 0, max: 10, step: 5 });
    expect(result.candidates.map((c) => c.value)).toEqual(["0", "5", "10"]);
  });

  it("caps at 20 candidates to avoid explosion", () => {
    const result = candidateValuesFor({ type: "number-range", min: 0, max: 1000, step: 1 });
    expect(result.candidates.length).toBeLessThanOrEqual(20);
  });

  it("handles fractional steps", () => {
    const result = candidateValuesFor({ type: "number-range", min: 0, max: 1, step: 0.5 });
    expect(result.candidates.map((c) => c.value)).toEqual(["0", "0.5", "1"]);
  });
});

describe("candidateValuesFor — free-form-string", () => {
  it("produces no candidates", () => {
    const result = candidateValuesFor({ type: "free-form-string" });
    expect(result.candidates).toEqual([]);
    expect(result.constrained).toBe(false);
  });
});

describe("isValidCandidate", () => {
  it("returns true when the value is in the boolean candidate set", () => {
    expect(isValidCandidate("true", { type: "boolean" })).toBe(true);
    expect(isValidCandidate("false", { type: "boolean" })).toBe(true);
  });

  it("returns false when the value is NOT in the boolean candidate set", () => {
    expect(isValidCandidate("maybe", { type: "boolean" })).toBe(false);
  });

  it("returns true when the value is in the string-literal-union set", () => {
    expect(
      isValidCandidate("primary", {
        type: "string-literal-union",
        literals: ["primary", "secondary"],
      }),
    ).toBe(true);
  });

  it("returns false when the value is NOT in the string-literal-union set", () => {
    expect(
      isValidCandidate("tertiary", {
        type: "string-literal-union",
        literals: ["primary", "secondary"],
      }),
    ).toBe(false);
  });

  it("returns true for any value when the prop is free-form-string", () => {
    expect(isValidCandidate("anything", { type: "free-form-string" })).toBe(true);
  });
});

describe("inferTypeMetadata", () => {
  it("infers boolean from literal-boolean", () => {
    const prop: DiscoveredProp = {
      name: "disabled",
      kind: "literal-boolean",
      rawValue: "",
      literalValue: true,
    };
    expect(inferTypeMetadata(prop).type).toBe("boolean");
  });

  it("infers number-range from literal-number", () => {
    const prop: DiscoveredProp = {
      name: "count",
      kind: "literal-number",
      rawValue: "42",
      literalValue: 42,
    };
    const meta = inferTypeMetadata(prop);
    expect(meta.type).toBe("number-range");
    expect(meta.min).toBe(42);
    expect(meta.max).toBe(42);
  });

  it("infers free-form-string from literal-string (no constraint without type info)", () => {
    const prop: DiscoveredProp = {
      name: "label",
      kind: "literal-string",
      rawValue: "Save",
      literalValue: "Save",
    };
    expect(inferTypeMetadata(prop).type).toBe("free-form-string");
  });

  it("infers free-form-string for dynamic props", () => {
    const prop: DiscoveredProp = { name: "x", kind: "identifier", rawValue: "someVar" };
    expect(inferTypeMetadata(prop).type).toBe("free-form-string");
  });
});
