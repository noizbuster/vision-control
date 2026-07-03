import { describe, expect, it } from "vitest";

import type { DiscoveredProp } from "./prop-discovery.js";
import {
  DETERMINISTIC_PROP_KINDS,
  DYNAMIC_PROP_KINDS,
  hasPropSourceRange,
  mapPropToSourceRange,
} from "./source-range-mapping.js";

const range = { startLine: 5, startColumn: 10, endLine: 5, endColumn: 20 };

const literalProp = (overrides?: Partial<DiscoveredProp>): DiscoveredProp => ({
  name: "variant",
  kind: "literal-string",
  rawValue: "secondary",
  literalValue: "secondary",
  sourceRange: range,
  ...overrides,
});

const dynamicProp = (overrides?: Partial<DiscoveredProp>): DiscoveredProp => ({
  name: "variant",
  kind: "dynamic-expression",
  rawValue: "computeVariant(user)",
  ...overrides,
});

describe("mapPropToSourceRange — literal props produce deterministic range", () => {
  it("returns deterministic:true with the range for a literal-string prop", () => {
    const mapping = mapPropToSourceRange(literalProp(), "jsx");
    expect(mapping.deterministic).toBe(true);
    expect(mapping.range).toEqual(range);
    expect(mapping.origin).toBe("jsx-attribute");
  });

  it("reports jsx-attribute origin for JSX", () => {
    expect(mapPropToSourceRange(literalProp(), "jsx").origin).toBe("jsx-attribute");
  });

  it("reports vue-attribute origin for Vue static props", () => {
    expect(mapPropToSourceRange(literalProp(), "vue").origin).toBe("vue-attribute");
  });

  it("reports vue-binding origin for Vue bound props", () => {
    expect(mapPropToSourceRange(literalProp({ isBinding: true }), "vue").origin).toBe(
      "vue-binding",
    );
  });

  it("reports svelte-attribute origin for Svelte", () => {
    expect(mapPropToSourceRange(literalProp(), "svelte").origin).toBe("svelte-attribute");
  });
});

describe("mapPropToSourceRange — dynamic props produce no range", () => {
  it("returns deterministic:false with no range for a dynamic-expression prop", () => {
    const mapping = mapPropToSourceRange(dynamicProp(), "jsx");
    expect(mapping.deterministic).toBe(false);
    expect(mapping.range).toBeUndefined();
  });

  it("returns deterministic:false for member-access", () => {
    const mapping = mapPropToSourceRange(
      dynamicProp({ kind: "member-access", rawValue: "config.variant" }),
      "jsx",
    );
    expect(mapping.deterministic).toBe(false);
  });

  it("returns deterministic:false for computed", () => {
    const mapping = mapPropToSourceRange(
      dynamicProp({ kind: "computed", rawValue: "cond ? 'a' : 'b'" }),
      "jsx",
    );
    expect(mapping.deterministic).toBe(false);
  });

  it("returns deterministic:false for identifier", () => {
    const mapping = mapPropToSourceRange(
      dynamicProp({ kind: "identifier", rawValue: "someVar" }),
      "jsx",
    );
    expect(mapping.deterministic).toBe(false);
  });
});

describe("hasPropSourceRange", () => {
  it("returns true when sourceRange is defined", () => {
    expect(hasPropSourceRange(literalProp())).toBe(true);
  });

  it("returns false when sourceRange is undefined", () => {
    expect(hasPropSourceRange(dynamicProp())).toBe(false);
  });
});

describe("DETERMINISTIC_PROP_KINDS and DYNAMIC_PROP_KINDS", () => {
  it("DETERMINISTIC_PROP_KINDS lists the three literal kinds", () => {
    expect([...DETERMINISTIC_PROP_KINDS]).toEqual([
      "literal-string",
      "literal-boolean",
      "literal-number",
    ]);
  });

  it("DYNAMIC_PROP_KINDS lists the four dynamic kinds", () => {
    expect([...DYNAMIC_PROP_KINDS]).toEqual([
      "dynamic-expression",
      "member-access",
      "computed",
      "identifier",
    ]);
  });
});
