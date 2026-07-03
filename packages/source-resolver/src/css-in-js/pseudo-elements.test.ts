/**
 * Pseudo-element editing tests (VC-V1V2-20) — TDD-first.
 *
 * Covers: the additive operation schema (pseudoClass field, malformed-input
 * rejection), source-origin resolution (ast-owned HIGH vs text-search MEDIUM),
 * and the preview-selector builder.
 */

import { describe, expect, it } from "vitest";

import { enforceNeverWrongHigh } from "../source-candidate.js";
import {
  buildPseudoElementEdit,
  PSEUDO_ELEMENTS,
  PSEUDO_STATES,
  PseudoElementEditSchema,
  type PseudoElementRule,
  pseudoPreviewSelector,
  resolvePseudoElementOrigin,
} from "./pseudo-elements.js";

const astOwnedRule = (overrides: Partial<PseudoElementRule> = {}): PseudoElementRule => ({
  selector: ".badge::before",
  pseudoClass: "::before",
  property: "content",
  value: '"NEW"',
  workspaceRelativePath: "src/Badge.css",
  startLine: 8,
  startColumn: 0,
  endLine: 10,
  endColumn: 1,
  astOwned: true,
  ...overrides,
});

describe("pseudo target taxonomy", () => {
  it("exposes the supported pseudo-elements and states", () => {
    expect([...PSEUDO_ELEMENTS]).toEqual(["::before", "::after"]);
    expect([...PSEUDO_STATES]).toEqual([":hover", ":focus", ":active", ":disabled"]);
  });
});

describe("PseudoElementEditSchema — additive operation schema", () => {
  it("accepts a well-formed ::before content edit", () => {
    const edit = buildPseudoElementEdit({
      runtimeId: "rt-001",
      pseudoClass: "::before",
      property: "content",
      value: '"hello"',
    });
    expect(edit.pseudoClass).toBe("::before");
    expect(edit.property).toBe("content");
  });

  it("accepts a :hover state edit with a previousValue", () => {
    const edit = buildPseudoElementEdit({
      runtimeId: "rt-002",
      pseudoClass: ":hover",
      property: "color",
      value: "red",
      previousValue: "blue",
    });
    expect(edit.previousValue).toBe("blue");
  });

  it("rejects an unknown pseudo class (malformed input)", () => {
    expect(() =>
      PseudoElementEditSchema.parse({
        runtimeId: "rt-003",
        pseudoClass: "::first-line",
        property: "color",
        value: "red",
      }),
    ).toThrow();
  });

  it("rejects an empty property or runtimeId", () => {
    expect(() =>
      PseudoElementEditSchema.parse({
        runtimeId: "",
        pseudoClass: "::before",
        property: "color",
        value: "red",
      }),
    ).toThrow();
    expect(() =>
      PseudoElementEditSchema.parse({
        runtimeId: "rt",
        pseudoClass: "::before",
        property: "",
        value: "red",
      }),
    ).toThrow();
  });
});

describe("resolvePseudoElementOrigin — source origin", () => {
  it("an AST-owned rule resolves to HIGH with ast-origin + range", () => {
    const candidate = resolvePseudoElementOrigin(astOwnedRule());
    expect(candidate.confidence).toBe("high");
    expect(candidate.evidence).toEqual(["ast-origin"]);
    expect(candidate.workspaceRelativePath).toBe("src/Badge.css");
    expect(candidate.startLine).toBe(8);
    expect(candidate.endLine).toBe(10);
    expect(candidate.cssFilePath).toBe("src/Badge.css");
    expect(candidate.snippet).toContain(".badge::before");
    expect(candidate.ownershipRisk).toBe("low");
  });

  it("the HIGH candidate survives never-wrong-HIGH (ast-origin is solo-strong)", () => {
    const candidate = resolvePseudoElementOrigin(astOwnedRule());
    expect(enforceNeverWrongHigh(candidate).confidence).toBe("high");
  });

  it("a non-AST-owned rule resolves to MEDIUM with text-search + agent-required", () => {
    const candidate = resolvePseudoElementOrigin(astOwnedRule({ astOwned: false }));
    expect(candidate.confidence).toBe("medium");
    expect(candidate.confidence).not.toBe("high");
    expect(candidate.evidence).toEqual(["text-search"]);
    expect(candidate.warnings.some((w) => w.includes("agent-required"))).toBe(true);
    expect(candidate.ownershipRisk).toBe("medium");
  });

  it("a :hover state rule resolves the same way (ast-owned HIGH)", () => {
    const candidate = resolvePseudoElementOrigin(
      astOwnedRule({
        pseudoClass: ":hover",
        property: "color",
        value: "red",
        selector: ".btn:hover",
      }),
    );
    expect(candidate.confidence).toBe("high");
    expect(candidate.evidence).toEqual(["ast-origin"]);
  });
});

describe("pseudoPreviewSelector — preview selector builder (pure)", () => {
  it("builds an attribute-selector + pseudo-element selector", () => {
    expect(pseudoPreviewSelector("rt-001", "::before")).toBe(
      '[data-vc-preview-id="rt-001"]::before',
    );
  });

  it("builds a pseudo-state selector", () => {
    expect(pseudoPreviewSelector("rt-002", ":hover")).toBe('[data-vc-preview-id="rt-002"]:hover');
  });
});
