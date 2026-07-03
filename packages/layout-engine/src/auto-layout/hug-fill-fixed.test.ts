import { describe, expect, it } from "vitest";

import {
  resolveHugFillFixed,
  type SizingParentContext,
  type SizingResolutionInput,
  tryResolveHugFillFixed,
} from "./hug-fill-fixed.js";

const resolve = (
  intent: SizingResolutionInput["intent"],
  parentContext: SizingParentContext,
  fixedValue?: string,
) =>
  resolveHugFillFixed({
    intent,
    parentContext,
    ...(fixedValue !== undefined ? { fixedValue } : {}),
  });

describe("resolveHugFillFixed — Hug is NEVER a single CSS property (PRD constraint)", () => {
  it("resolves Hug on a flex-row item to flex + width (two declarations, not one)", () => {
    const r = resolve("hug", "flex-row");
    expect(r.intent).toBe("hug");
    expect(r.parentContext).toBe("flex-row");
    expect(r.declarations.length).toBeGreaterThanOrEqual(2);
    const props = r.declarations.map((d) => d.property);
    expect(props).toContain("flex");
    expect(props).toContain("width");
    const flex = r.declarations.find((d) => d.property === "flex");
    expect(flex?.value).toBe("0 0 auto");
    const width = r.declarations.find((d) => d.property === "width");
    expect(width?.value).toMatch(/max-content|min-content|fit-content/);
  });

  it("resolves Hug on a flex-column item to flex + height (vertical axis)", () => {
    const r = resolve("hug", "flex-column");
    const props = r.declarations.map((d) => d.property);
    expect(props).toContain("flex");
    expect(props).toContain("height");
    expect(r.axis).toBe("main");
  });

  it("resolves Hug on a block child to width: fit-content (different property than flex)", () => {
    const r = resolve("hug", "block");
    const width = r.declarations.find((d) => d.property === "width");
    expect(width?.value).toBe("fit-content");
    expect(r.declarations.find((d) => d.property === "flex")).toBeUndefined();
  });

  it("resolves Hug on a grid item to justify-self + width (not just width)", () => {
    const r = resolve("hug", "grid");
    const props = r.declarations.map((d) => d.property);
    expect(props).toContain("justify-self");
    expect(props).toContain("width");
  });

  it("does NOT equate Hug with a fixed single property across contexts (the core invariant)", () => {
    const flexRow = resolve("hug", "flex-row");
    const block = resolve("hug", "block");
    const grid = resolve("hug", "grid");
    // The declaration SETS differ across contexts — Hug is not a constant property.
    const flexRowProps = flexRow.declarations
      .map((d) => d.property)
      .sort()
      .join(",");
    const blockProps = block.declarations
      .map((d) => d.property)
      .sort()
      .join(",");
    const gridProps = grid.declarations
      .map((d) => d.property)
      .sort()
      .join(",");
    expect(flexRowProps).not.toBe(blockProps);
    expect(blockProps).not.toBe(gridProps);
    expect(flexRowProps).not.toBe(gridProps);
  });
});

describe("resolveHugFillFixed — Fill resolves based on parent context", () => {
  it("resolves Fill on a flex-row item to flex: 1 1 0% (grow, not width: 100%)", () => {
    const r = resolve("fill", "flex-row");
    const flex = r.declarations.find((d) => d.property === "flex");
    expect(flex?.value).toBe("1 1 0%");
    // Fill on flex does NOT use width: 100% (that would be wrong for flex items).
    expect(r.declarations.find((d) => d.property === "width")).toBeUndefined();
  });

  it("resolves Fill on a block child to width: 100% (different than flex)", () => {
    const r = resolve("fill", "block");
    const width = r.declarations.find((d) => d.property === "width");
    expect(width?.value).toBe("100%");
    expect(r.declarations.find((d) => d.property === "flex")).toBeUndefined();
  });

  it("resolves Fill on a grid item to justify-self: stretch + width: 100%", () => {
    const r = resolve("fill", "grid");
    const js = r.declarations.find((d) => d.property === "justify-self");
    expect(js?.value).toBe("stretch");
    const width = r.declarations.find((d) => d.property === "width");
    expect(width?.value).toBe("100%");
  });
});

describe("resolveHugFillFixed — Fixed pins an explicit value", () => {
  it("resolves Fixed on a flex-row item to flex-basis + width echoing the value", () => {
    const r = resolve("fixed", "flex-row", "200px");
    const flex = r.declarations.find((d) => d.property === "flex");
    expect(flex?.value).toBe("0 0 200px");
    const width = r.declarations.find((d) => d.property === "width");
    expect(width?.value).toBe("200px");
  });

  it("resolves Fixed on a block child to width: <value>", () => {
    const r = resolve("fixed", "block", "12rem");
    const width = r.declarations.find((d) => d.property === "width");
    expect(width?.value).toBe("12rem");
  });

  it("throws when fixed intent is given without a value (programming error)", () => {
    expect(() => resolve("fixed", "block")).toThrow(/fixedValue/i);
  });
});

describe("tryResolveHugFillFixed — safe wrapper for adversarial contexts", () => {
  it("returns a diagnostic for an inline parent context (no invalid CSS applied)", () => {
    const result = tryResolveHugFillFixed({ intent: "hug", parentContext: "inline" });
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.diagnostic).toBe("unsupported-context");
      expect(result.message).toMatch(/inline/);
    }
  });

  it("returns a diagnostic for an unknown parent context", () => {
    const result = tryResolveHugFillFixed({ intent: "fill", parentContext: "unknown" });
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.diagnostic).toBe("unsupported-context");
    }
  });

  it("returns a diagnostic for fixed intent without a value", () => {
    const result = tryResolveHugFillFixed({ intent: "fixed", parentContext: "block" });
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.message).toMatch(/fixed.*value/i);
    }
  });

  it("resolves normally for valid flex-row hug context", () => {
    const result = tryResolveHugFillFixed({ intent: "hug", parentContext: "flex-row" });
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.resolution.intent).toBe("hug");
    }
  });
});

describe("resolveHugFillFixed — each resolution carries a rationale", () => {
  const contexts: SizingParentContext[] = ["flex-row", "flex-column", "block", "grid"];
  for (const ctx of contexts) {
    it(`carries a non-empty rationale for ${ctx} hug`, () => {
      const r = resolve("hug", ctx);
      expect(r.rationale.length).toBeGreaterThan(10);
    });
    it(`carries a non-empty rationale for ${ctx} fill`, () => {
      const r = resolve("fill", ctx);
      expect(r.rationale.length).toBeGreaterThan(10);
    });
  }
});
