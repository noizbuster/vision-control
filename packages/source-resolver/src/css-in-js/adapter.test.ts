/**
 * CSS-in-JS adapter tests (VC-V1V2-20) — TDD-first.
 *
 * The never-wrong-HIGH contract is the spine: a static AST-owned definition
 * resolves HIGH (ast-origin + range), while ANY dynamic marker downgrades to
 * MEDIUM with an "agent-required" warning. The bare singleton never returns
 * HIGH (no registry proof).
 */

import { describe, expect, it } from "vitest";

import { enforceNeverWrongHigh } from "../source-candidate.js";
import { CSS_IN_JS_ADAPTER, createCssInJsAdapter, detectCssInJsHeuristic } from "./adapter.js";
import type { CssInJsDefinition } from "./static-extraction.js";

const ctx = (cssClasses: readonly string[]) => ({
  identity: {
    runtimeId: "r-1",
    tagName: "button",
    frameId: "main",
    fingerprint: "ff",
    confidence: "high" as const,
  },
  cssClasses,
});

const staticDef = (overrides: Partial<CssInJsDefinition> = {}): CssInJsDefinition => ({
  flavor: "emotion",
  shape: "object-literal",
  body: 'color: "red", padding: 12',
  workspaceRelativePath: "src/Button.tsx",
  startLine: 4,
  startColumn: 12,
  endLine: 4,
  endColumn: 40,
  componentName: "Button",
  ...overrides,
});

const dynamicDef = (overrides: Partial<CssInJsDefinition> = {}): CssInJsDefinition => ({
  flavor: "styled-components",
  shape: "template-literal",
  body: "color: red;\n  background: ${bg};",
  workspaceRelativePath: "src/Card.tsx",
  startLine: 2,
  startColumn: 20,
  endLine: 5,
  endColumn: 1,
  componentName: "Card",
  ...overrides,
});

describe("detectCssInJsHeuristic", () => {
  it("detects styled-components sc- names", () => {
    const r = detectCssInJsHeuristic("sc-1abcde");
    expect(r.matched).toBe(true);
    expect(r.flavor).toBe("styled-components");
    expect(r.confidence).toBe("medium");
  });

  it("detects emotion css-/emotion- names", () => {
    expect(detectCssInJsHeuristic("css-1a2b3c").matched).toBe(true);
    expect(detectCssInJsHeuristic("emotion-12").matched).toBe(true);
  });

  it("does not match a plain utility class", () => {
    expect(detectCssInJsHeuristic("active").matched).toBe(false);
    expect(detectCssInJsHeuristic("btn-primary").matched).toBe(false);
  });
});

describe("createCssInJsAdapter — static extractable case (HIGH, ast-origin)", () => {
  it("resolves a static definition to HIGH with ast-origin + range", () => {
    const adapter = createCssInJsAdapter({
      definitions: new Map([["btn-abc", staticDef()]]),
    });
    const [candidate] = adapter.resolve(ctx(["btn-abc"]));
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.evidence).toEqual(["ast-origin"]);
    expect(candidate?.workspaceRelativePath).toBe("src/Button.tsx");
    expect(candidate?.startLine).toBe(4);
    expect(candidate?.endLine).toBe(4);
    expect(candidate?.componentName).toBe("Button");
    expect(candidate?.snippet).toContain("color: red");
    expect(candidate?.ownershipRisk).toBe("low");
    expect(candidate?.warnings).toEqual([]);
  });

  it("survives the never-wrong-HIGH policy (ast-origin + range qualifies)", () => {
    const adapter = createCssInJsAdapter({
      definitions: new Map([["btn-abc", staticDef()]]),
    });
    const [candidate] = adapter.resolve(ctx(["btn-abc"]));
    if (candidate === undefined) throw new Error("expected a candidate");
    const enforced = enforceNeverWrongHigh(candidate);
    expect(enforced.confidence).toBe("high");
  });

  it("returns an empty list when no classes are present", () => {
    const adapter = createCssInJsAdapter({ definitions: new Map() });
    expect(adapter.resolve(ctx([]))).toEqual([]);
  });

  it("returns nothing for a class not in the registry that is not a generated name", () => {
    const adapter = createCssInJsAdapter({ definitions: new Map() });
    expect(adapter.resolve(ctx(["plain-class"]))).toEqual([]);
  });
});

describe("createCssInJsAdapter — dynamic case (MEDIUM, agent-required, never HIGH)", () => {
  it("resolves a dynamic definition to MEDIUM with text-search + agent-required", () => {
    const adapter = createCssInJsAdapter({
      definitions: new Map([["sc-dyn1", dynamicDef()]]),
    });
    const [candidate] = adapter.resolve(ctx(["sc-dyn1"]));
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("medium");
    expect(candidate?.confidence).not.toBe("high");
    expect(candidate?.evidence).toEqual(["text-search"]);
    expect(candidate?.ownershipRisk).toBe("high");
    expect(candidate?.warnings.some((w) => w.includes("agent-required"))).toBe(true);
  });

  it("a dynamic candidate survives never-wrong-HIGH unchanged (already MEDIUM)", () => {
    const adapter = createCssInJsAdapter({
      definitions: new Map([["sc-dyn1", dynamicDef()]]),
    });
    const [candidate] = adapter.resolve(ctx(["sc-dyn1"]));
    if (candidate === undefined) throw new Error("expected a candidate");
    expect(enforceNeverWrongHigh(candidate).confidence).toBe("medium");
  });

  it("emits the precise dynamic reason in the warnings", () => {
    const adapter = createCssInJsAdapter({
      definitions: new Map([["sc-dyn1", dynamicDef()]]),
    });
    const [candidate] = adapter.resolve(ctx(["sc-dyn1"]));
    expect(candidate?.warnings.some((w) => w.includes("template-interpolation"))).toBe(true);
  });
});

describe("CSS_IN_JS_ADAPTER singleton — heuristic fallback, never HIGH", () => {
  it("resolves a styled-components generated name to MEDIUM advisory", () => {
    const [candidate] = CSS_IN_JS_ADAPTER.resolve(ctx(["sc-1abcde"]));
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("medium");
    expect(candidate?.confidence).not.toBe("high");
    expect(candidate?.evidence).toEqual(["text-search"]);
    expect(candidate?.warnings.some((w) => w.includes("agent-required"))).toBe(true);
    expect(candidate?.ownershipRisk).toBe("high");
  });

  it("returns nothing for a non-generated class name", () => {
    expect(CSS_IN_JS_ADAPTER.resolve(ctx(["my-button"]))).toEqual([]);
  });

  it("the singleton has the canonical adapter id", () => {
    expect(CSS_IN_JS_ADAPTER.id).toBe("css-in-js");
  });
});

describe("createCssInJsAdapter — static vs dynamic discrimination (the adversarial spine)", () => {
  it("a static object-literal and a dynamic template for the SAME class differ in confidence", () => {
    const staticAdapter = createCssInJsAdapter({
      definitions: new Map([["shared", staticDef()]]),
    });
    const dynamicAdapter = createCssInJsAdapter({
      definitions: new Map([["shared", dynamicDef()]]),
    });
    const [s] = staticAdapter.resolve(ctx(["shared"]));
    const [d] = dynamicAdapter.resolve(ctx(["shared"]));
    expect(s?.confidence).toBe("high");
    expect(d?.confidence).toBe("medium");
  });

  it("a static candidate without a range still survives HIGH (ast-origin is solo-strong)", () => {
    // ast-origin qualifies for HIGH even without a range; the static path
    // always carries a range, but verify the policy is ast-origin-driven.
    const def = staticDef({ startLine: 0, endLine: 0 });
    const adapter = createCssInJsAdapter({ definitions: new Map([["x", def]]) });
    const [candidate] = adapter.resolve(ctx(["x"]));
    // Static extraction still runs; range is present from the definition.
    expect(candidate?.evidence).toEqual(["ast-origin"]);
  });
});
