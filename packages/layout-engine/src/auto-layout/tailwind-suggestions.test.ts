import { describe, expect, it } from "vitest";

import type { ContainerPropertyCandidate } from "./auto-layout-candidates.js";
import {
  composeProviders,
  createSpacingTokenProvider,
  isSpacingProperty,
  mapCssToTailwindUtility,
  suggestForCandidate,
  suggestTokens,
  type TokenSuggestionProvider,
} from "./tailwind-suggestions.js";

const gapCandidate: ContainerPropertyCandidate = {
  kind: "container-layout",
  property: "gap",
  value: "1rem",
  rationale: "",
};

describe("mapCssToTailwindUtility — static mapping for layout/alignment", () => {
  it("maps flex-direction column to flex-col", () => {
    expect(mapCssToTailwindUtility("flex-direction", "column")).toBe("flex-col");
  });

  it("maps flex-direction row-reverse to flex-row-reverse", () => {
    expect(mapCssToTailwindUtility("flex-direction", "row-reverse")).toBe("flex-row-reverse");
  });

  it("maps justify-content center to justify-center", () => {
    expect(mapCssToTailwindUtility("justify-content", "center")).toBe("justify-center");
  });

  it("maps justify-content space-between to justify-between", () => {
    expect(mapCssToTailwindUtility("justify-content", "space-between")).toBe("justify-between");
  });

  it("maps align-items stretch to items-stretch", () => {
    expect(mapCssToTailwindUtility("align-items", "stretch")).toBe("items-stretch");
  });

  it("maps align-items baseline to items-baseline", () => {
    expect(mapCssToTailwindUtility("align-items", "baseline")).toBe("items-baseline");
  });

  it("maps flex-wrap wrap to flex-wrap", () => {
    expect(mapCssToTailwindUtility("flex-wrap", "wrap")).toBe("flex-wrap");
  });

  it("maps flex-wrap nowrap to flex-nowrap", () => {
    expect(mapCssToTailwindUtility("flex-wrap", "nowrap")).toBe("flex-nowrap");
  });

  it("maps flex shorthand 0 0 auto to flex-none", () => {
    expect(mapCssToTailwindUtility("flex", "0 0 auto")).toBe("flex-none");
  });

  it("maps flex shorthand 1 1 0% to flex-1", () => {
    expect(mapCssToTailwindUtility("flex", "1 1 0%")).toBe("flex-1");
  });

  it("maps width 100% to w-full", () => {
    expect(mapCssToTailwindUtility("width", "100%")).toBe("w-full");
  });

  it("maps width max-content to w-max", () => {
    expect(mapCssToTailwindUtility("width", "max-content")).toBe("w-max");
  });

  it("maps width fit-content to w-fit", () => {
    expect(mapCssToTailwindUtility("width", "fit-content")).toBe("w-fit");
  });

  it("returns undefined for value-driven properties like gap", () => {
    expect(mapCssToTailwindUtility("gap", "1rem")).toBeUndefined();
  });

  it("returns undefined for unknown properties", () => {
    expect(mapCssToTailwindUtility("background-color", "red")).toBeUndefined();
  });
});

describe("isSpacingProperty", () => {
  it("identifies gap, row-gap, column-gap, padding", () => {
    expect(isSpacingProperty("gap")).toBe(true);
    expect(isSpacingProperty("row-gap")).toBe(true);
    expect(isSpacingProperty("column-gap")).toBe(true);
    expect(isSpacingProperty("padding")).toBe(true);
  });

  it("identifies individual padding sides", () => {
    expect(isSpacingProperty("padding-top")).toBe(true);
    expect(isSpacingProperty("padding-left")).toBe(true);
  });

  it("rejects non-spacing properties", () => {
    expect(isSpacingProperty("flex-direction")).toBe(false);
    expect(isSpacingProperty("color")).toBe(false);
  });
});

describe("suggestTokens — static utilities without providers", () => {
  it("suggests flex-col for flex-direction column with no providers", () => {
    const result = suggestTokens([], "flex-direction", "column");
    expect(result).toHaveLength(1);
    expect(result[0]?.utility).toBe("flex-col");
    expect(result[0]?.confidence).toBe(1);
  });

  it("suggests items-center for align-items center", () => {
    const result = suggestTokens([], "align-items", "center");
    expect(result[0]?.utility).toBe("items-center");
  });

  it("returns empty for value-driven properties with no providers", () => {
    const result = suggestTokens([], "gap", "1rem");
    expect(result).toEqual([]);
  });
});

describe("suggestTokens — with a spacing provider", () => {
  const provider = createSpacingTokenProvider({
    spacing: { "2": "0.5rem", "4": "1rem", "6": "1.5rem", "8": "2rem" },
  });

  it("resolves gap 1rem to gap-4 (exact match)", () => {
    const result = suggestTokens([provider], "gap", "1rem");
    const gap = result.find((s) => s.utility.startsWith("gap-"));
    expect(gap?.utility).toBe("gap-4");
    expect(gap?.confidence).toBe(1);
  });

  it("resolves padding-top 0.5rem to pt-2", () => {
    const result = suggestTokens([provider], "padding-top", "0.5rem");
    expect(result[0]?.utility).toBe("pt-2");
  });

  it("resolves column-gap 2rem to gap-x-8", () => {
    const result = suggestTokens([provider], "column-gap", "2rem");
    expect(result[0]?.utility).toBe("gap-x-8");
  });

  it("returns nearest match for a non-exact value", () => {
    const result = suggestTokens([provider], "gap", "0.875rem");
    expect(result.length).toBeGreaterThan(0);
    // 0.875rem = 14px; nearest is 0.5rem(8px) or 1rem(16px); 16 is closer
    expect(result[0]?.utility).toBe("gap-4");
    expect(result[0]?.confidence).toBeLessThan(1);
    expect(result[0]?.confidence).toBeGreaterThan(0);
  });

  it("returns empty for non-spacing properties", () => {
    const result = suggestTokens([provider], "flex-direction", "row");
    // flex-direction has a static mapping → 1 suggestion, but the provider adds nothing
    const spacingOnly = result.filter((s) => s.category === "spacing");
    expect(spacingOnly).toEqual([]);
  });
});

describe("suggestForCandidate — container-layout candidate", () => {
  const provider = createSpacingTokenProvider({
    spacing: { "4": "1rem" },
  });

  it("produces token suggestions for a gap candidate", () => {
    const result = suggestForCandidate([provider], gapCandidate);
    expect(result).toHaveLength(1);
    expect(result[0]?.property).toBe("gap");
    expect(result[0]?.suggestions.length).toBeGreaterThan(0);
    expect(result[0]?.suggestions[0]?.utility).toBe("gap-4");
  });

  it("produces token suggestions for a justify-content candidate (static only)", () => {
    const candidate: ContainerPropertyCandidate = {
      kind: "container-layout",
      property: "justify-content",
      value: "center",
      rationale: "",
    };
    const result = suggestForCandidate([], candidate);
    expect(result[0]?.suggestions[0]?.utility).toBe("justify-center");
  });
});

describe("suggestForCandidate — child-sizing candidate (multiple declarations)", () => {
  it("produces one suggestion set per declaration", () => {
    const candidate = {
      kind: "child-sizing" as const,
      childIndex: 0,
      intent: "hug" as const,
      declarations: [
        { property: "flex", value: "0 0 auto" },
        { property: "width", value: "max-content" },
      ],
      rationale: "",
    };
    const result = suggestForCandidate([], candidate);
    expect(result).toHaveLength(2);
    expect(result[0]?.suggestions[0]?.utility).toBe("flex-none");
    expect(result[1]?.suggestions[0]?.utility).toBe("w-max");
  });
});

describe("composeProviders", () => {
  it("combines suggestions from multiple providers in order", () => {
    const p1: TokenSuggestionProvider = {
      id: "p1",
      suggest: () => [{ utility: "gap-4", category: "spacing", confidence: 1 }],
    };
    const p2: TokenSuggestionProvider = {
      id: "p2",
      suggest: () => [{ utility: "gap-6", category: "spacing", confidence: 0.8 }],
    };
    const composite = composeProviders(p1, p2);
    const result = composite.suggest("gap", "1rem");
    expect(result).toHaveLength(2);
    expect(result[0]?.utility).toBe("gap-4");
    expect(result[1]?.utility).toBe("gap-6");
  });

  it("has id 'composite'", () => {
    expect(composeProviders().id).toBe("composite");
  });
});

describe("createSpacingTokenProvider — edge cases", () => {
  it("returns empty for non-spacing properties", () => {
    const provider = createSpacingTokenProvider({ spacing: { "4": "1rem" } });
    expect(provider.suggest("color", "red")).toEqual([]);
  });

  it("returns empty for unparseable values", () => {
    const provider = createSpacingTokenProvider({ spacing: { "4": "1rem" } });
    expect(provider.suggest("gap", "auto")).toEqual([]);
  });

  it("returns empty when no scale tokens are parseable", () => {
    const provider = createSpacingTokenProvider({ spacing: { weird: "calc(1px + 2px)" } });
    expect(provider.suggest("gap", "1rem")).toEqual([]);
  });
});
