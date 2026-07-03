/**
 * Deterministic patch suggestion generator tests (VC-V1V2-14 / ADR-012).
 *
 * TDD-first: every policy is encoded here. The two load-bearing contracts:
 *   1. A safe static edit with AST-owned source ownership + a concrete range
 *      produces a HIGH-confidence inert `SuggestedDiff` (diff text + range +
 *      preconditions). It is DATA — nothing applies it.
 *   2. A dynamic / computed edit (props.className, conditional, CSS-in-JS)
 *      produces NO suggestion; it returns an "agent-required" signal instead.
 *      The generator does not try to be clever.
 *
 * The confidence policy mirrors the never-wrong-HIGH rule (VC-V1V2-04): HIGH
 * requires strong evidence (ast-origin / marker) AND a source range.
 */

import { describe, expect, it } from "vitest";

import {
  type AgentRequiredResult,
  buildUnifiedDiff,
  generateSuggestedDiff,
  type StaticEditIntent,
  SUGGESTION_KINDS,
  type SuggestedDiff,
  type SuggestedDiffResult,
  SuggestedDiffSchema,
  toSuggestedDiffSummary,
} from "./index.js";

const range = (startLine: number, startColumn = 0, endLine = startLine, endColumn = 8) => ({
  startLine,
  startColumn,
  endLine,
  endColumn,
});

const staticTailwind: StaticEditIntent = {
  kind: "tailwind-token-replace",
  filePath: "src/Button.tsx",
  className: "gap-2",
  oldValue: "gap-2",
  newValue: "gap-4",
  oldLine: '  <div className="flex gap-2">items</div>',
  newLine: '  <div className="flex gap-4">items</div>',
  sourceRange: range(10, 22, 10, 27),
  evidence: ["ast-origin"],
  ownership: "unambiguous",
};

describe("SUGGESTION_KINDS — the deterministic-suggestion kinds", () => {
  it("lists exactly the eight deterministic-suggestion kinds", () => {
    expect([...SUGGESTION_KINDS]).toEqual([
      "tailwind-token-replace",
      "css-declaration-replace",
      "css-class-replace",
      "css-modules-local-edit",
      "inline-style-object-edit",
      "jsx-text-edit",
      "simple-reorder",
      "component-prop-edit",
    ]);
  });
});

describe("generateSuggestedDiff — static AST-owned edits produce a HIGH suggestion", () => {
  it("a static tailwind token replace (px-3 -> px-4) with ast-origin + range yields HIGH", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      className: "px-3",
      oldValue: "px-3",
      newValue: "px-4",
      oldLine: '  <button className="px-3">Save</button>',
      newLine: '  <button className="px-4">Save</button>',
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    const suggestion = result.suggestion;
    expect(suggestion.kind).toBe("tailwind-token-replace");
    expect(suggestion.confidence).toBe("high");
    expect(suggestion.filePath).toBe("src/Button.tsx");
    expect(suggestion.sourceRanges).toHaveLength(1);
    expect(suggestion.sourceRanges[0]?.startLine).toBe(10);
    expect(suggestion.diff).toContain("--- a/src/Button.tsx");
    expect(suggestion.diff).toContain("+++ b/src/Button.tsx");
    expect(suggestion.diff).toContain("@@ -10,1 +10,1 @@");
    expect(suggestion.diff).toContain('className="px-3"');
    expect(suggestion.diff).toContain('className="px-4"');
    expect(suggestion.preconditions.length).toBeGreaterThan(0);
    expect(suggestion.preconditions.some((p) => /HMR/i.test(p))).toBe(true);
  });

  it("a css declaration replace (color: red -> color: blue) yields HIGH with ast-origin + range", () => {
    const result = generateSuggestedDiff({
      kind: "css-declaration-replace",
      filePath: "src/styles.css",
      cssProperty: "color",
      oldValue: "red",
      newValue: "blue",
      oldLine: ".btn { color: red; }",
      newLine: ".btn { color: blue; }",
      sourceRange: range(4, 14, 4, 17),
      evidence: ["ast-origin"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.suggestion.kind).toBe("css-declaration-replace");
    expect(result.suggestion.diff).toContain("-.btn { color: red; }");
    expect(result.suggestion.diff).toContain("+.btn { color: blue; }");
  });

  it("a css class replace (.button -> .button-primary) yields HIGH", () => {
    const result = generateSuggestedDiff({
      kind: "css-class-replace",
      filePath: "src/Card.tsx",
      className: "button",
      oldValue: "button",
      newValue: "button-primary",
      oldLine: '  <div className="button">x</div>',
      newLine: '  <div className="button-primary">x</div>',
      sourceRange: range(2, 18, 2, 24),
      evidence: ["marker"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.suggestion.kind).toBe("css-class-replace");
  });

  it("a css modules local class edit yields HIGH with marker evidence + range", () => {
    const result = generateSuggestedDiff({
      kind: "css-modules-local-edit",
      filePath: "src/Button.module.css",
      className: "root",
      oldValue: "  padding: 8px;",
      newValue: "  padding: 16px;",
      oldLine: ".root {",
      newLine: ".root {",
      sourceRange: range(2, 2, 2, 15),
      evidence: ["manifest", "source-map"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("high");
  });

  it("an inline style object literal edit yields HIGH with ast-origin + range", () => {
    const result = generateSuggestedDiff({
      kind: "inline-style-object-edit",
      filePath: "src/Box.tsx",
      oldValue: "padding: 8",
      newValue: "padding: 16",
      oldLine: "  <div style={{ padding: 8 }} />",
      newLine: "  <div style={{ padding: 16 }} />",
      sourceRange: range(7, 19, 7, 29),
      evidence: ["ast-origin"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.suggestion.kind).toBe("inline-style-object-edit");
  });

  it("a static jsx text edit (Save -> Save changes) yields HIGH with marker + range", () => {
    const result = generateSuggestedDiff({
      kind: "jsx-text-edit",
      filePath: "src/SaveButton.tsx",
      oldValue: "Save",
      newValue: "Save changes",
      oldLine: "  <button>Save</button>",
      newLine: "  <button>Save changes</button>",
      sourceRange: range(3, 10, 3, 14),
      evidence: ["marker"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.suggestion.diff).toContain("-  <button>Save</button>");
    expect(result.suggestion.diff).toContain("+  <button>Save changes</button>");
  });

  it("a simple sibling reorder with clear AST ownership yields HIGH", () => {
    const result = generateSuggestedDiff({
      kind: "simple-reorder",
      filePath: "src/List.tsx",
      parentSelector: "ul.list",
      fromIndex: 0,
      toIndex: 2,
      oldValue: "<li>a</li>\n<li>b</li>\n<li>c</li>",
      newValue: "<li>b</li>\n<li>c</li>\n<li>a</li>",
      sourceRange: range(5, 2, 7, 12),
      evidence: ["ast-origin"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.suggestion.kind).toBe("simple-reorder");
    expect(result.suggestion.diff).toContain("@@ -5,3 +5,3 @@");
  });

  it("a component prop edit (variant=secondary -> variant=primary) yields HIGH with ast-origin + range", () => {
    const result = generateSuggestedDiff({
      kind: "component-prop-edit",
      filePath: "src/Button.tsx",
      componentName: "Button",
      propName: "variant",
      oldValue: "secondary",
      newValue: "primary",
      oldLine: '  <Button variant="secondary">Save</Button>',
      newLine: '  <Button variant="primary">Save</Button>',
      sourceRange: range(5, 18, 5, 28),
      evidence: ["ast-origin"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("high");
    expect(result.suggestion.kind).toBe("component-prop-edit");
    expect(result.suggestion.diff).toContain('variant="secondary"');
    expect(result.suggestion.diff).toContain('variant="primary"');
    expect(result.suggestion.preconditions.some((p) => /prop/i.test(p))).toBe(true);
  });
});

describe("generateSuggestedDiff — confidence downgrades follow never-wrong-HIGH", () => {
  it("text-backed ownership (no AST evidence) yields MEDIUM, never HIGH", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      evidence: ["text-search"],
      ownership: "text-backed",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("medium");
    expect(result.suggestion.confidence).not.toBe("high");
  });

  it("unambiguous ownership claimed but evidence is only text-search downgrades to MEDIUM", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      evidence: ["text-search"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("medium");
  });

  it("ambiguous ownership (multiple candidate sites) yields LOW", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      evidence: ["text-search"],
      ownership: "ambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("low");
  });

  it("unambiguous ownership with NO evidence still yields MEDIUM (not HIGH)", () => {
    const result = generateSuggestedDiff({ ...staticTailwind, evidence: [] });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).toBe("medium");
  });

  it("llm-inference evidence never reaches HIGH", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      evidence: ["llm-inference"],
      ownership: "unambiguous",
    });
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(result.suggestion.confidence).not.toBe("high");
  });
});

describe("generateSuggestedDiff — dynamic / computed edits return agent-required (NO suggestion)", () => {
  it("props.className (dynamic) returns agent-required with no suggestion", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      className: "props.className",
      oldValue: "props.className",
      newValue: "props.className + ' px-4'",
      ownership: "dynamic",
    });
    expect(result.kind).toBe("agent-required");
    if (result.kind !== "agent-required") throw new Error("expected agent-required");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.reason.toLowerCase()).toContain("dynamic");
  });

  it("a conditional class (cond ? a : b) returns agent-required", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      className: "active ? 'on' : 'off'",
      oldValue: "active ? 'on' : 'off'",
      newValue: "'on'",
      ownership: "dynamic",
    });
    expect(result.kind).toBe("agent-required");
  });

  it("computed CSS-in-JS ownership returns agent-required", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      kind: "css-class-replace",
      className: "css`color:red`",
      ownership: "dynamic",
    });
    expect(result.kind).toBe("agent-required");
  });
});

describe("generateSuggestedDiff — malformed / stale input degrades gracefully", () => {
  it("a missing source range (non-dynamic) returns agent-required, not a suggestion", () => {
    const result = generateSuggestedDiff({
      kind: "tailwind-token-replace",
      filePath: "src/Button.tsx",
      oldValue: "px-3",
      newValue: "px-4",
      evidence: ["ast-origin"],
      ownership: "unambiguous",
      // no sourceRange
    });
    expect(result.kind).toBe("agent-required");
    if (result.kind !== "agent-required") throw new Error("expected agent-required");
    expect(result.reason.toLowerCase()).toContain("range");
  });

  it("a stale range (endLine < startLine) returns agent-required", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      sourceRange: { startLine: 10, startColumn: 0, endLine: 5, endColumn: 3 },
    });
    expect(result.kind).toBe("agent-required");
    if (result.kind !== "agent-required") throw new Error("expected agent-required");
    expect(result.reason.toLowerCase()).toContain("range");
  });

  it("an empty filePath returns agent-required", () => {
    const result = generateSuggestedDiff({ ...staticTailwind, filePath: "" });
    expect(result.kind).toBe("agent-required");
  });

  it("a no-op (oldValue equals newValue) returns agent-required", () => {
    const result = generateSuggestedDiff({
      ...staticTailwind,
      oldValue: "px-3",
      newValue: "px-3",
      oldLine: '  <button className="px-3">Save</button>',
      newLine: '  <button className="px-3">Save</button>',
    });
    expect(result.kind).toBe("agent-required");
    if (result.kind !== "agent-required") throw new Error("expected agent-required");
    expect(result.reason.toLowerCase()).toContain("no effect");
  });
});

describe("generateSuggestedDiff — every suggestion is schema-valid inert data", () => {
  it.each([...SUGGESTION_KINDS])("kind %s produces a SuggestedDiffSchema-valid payload", (kind) => {
    const intent: StaticEditIntent = {
      kind,
      filePath: "src/Fixture.tsx",
      oldValue: "old",
      newValue: "new",
      oldLine: "old line",
      newLine: "new line",
      sourceRange: range(1),
      evidence: ["ast-origin"],
      ownership: "unambiguous",
    };
    const result = generateSuggestedDiff(intent);
    expect(result.kind).toBe("suggestion");
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    expect(SuggestedDiffSchema.safeParse(result.suggestion).success).toBe(true);
    // applied / write flags must NOT exist on the inert payload (ADR-012)
    expect("applied" in result.suggestion).toBe(false);
  });
});

describe("buildUnifiedDiff — unified diff format", () => {
  it("emits a/ b/ headers, a single hunk header, and -/+ line pairs", () => {
    const diff = buildUnifiedDiff({
      filePath: "src/Button.tsx",
      range: range(10),
      oldLine: 'className="px-3"',
      newLine: 'className="px-4"',
    });
    expect(diff.startsWith("--- a/src/Button.tsx\n")).toBe(true);
    expect(diff).toContain("+++ b/src/Button.tsx\n");
    expect(diff).toContain("@@ -10,1 +10,1 @@");
    expect(diff).toContain('-className="px-3"');
    expect(diff).toContain('+className="px-4"');
  });

  it("supports multi-line hunks for reorder edits", () => {
    const diff = buildUnifiedDiff({
      filePath: "src/List.tsx",
      range: range(5, 0, 7),
      oldLine: "<li>a</li>\n<li>b</li>\n<li>c</li>",
      newLine: "<li>b</li>\n<li>c</li>\n<li>a</li>",
    });
    expect(diff).toContain("@@ -5,3 +5,3 @@");
    expect(diff).toContain("-<li>a</li>");
    expect(diff).toContain("+<li>b</li>");
  });

  it("defaults the line content to the value when no full line is supplied", () => {
    const diff = buildUnifiedDiff({
      filePath: "src/X.tsx",
      range: range(2),
      oldLine: "px-3",
      newLine: "px-4",
    });
    expect(diff).toContain("-px-3");
    expect(diff).toContain("+px-4");
  });
});

describe("toSuggestedDiffSummary — context-compiler projection", () => {
  it("projects a SuggestedDiff to the context-compiler summary shape", () => {
    const result = generateSuggestedDiff(staticTailwind);
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    const summary = toSuggestedDiffSummary(result.suggestion);
    expect(summary.diff).toBe(result.suggestion.diff);
    expect(summary.confidence).toBe("high");
    expect(summary.preconditions).toEqual(result.suggestion.preconditions);
    expect(summary.kind).toBe("tailwind-token-replace");
    expect(summary.sourceRanges).toEqual(result.suggestion.sourceRanges);
  });

  it("round-trips a summary back through the local schema", () => {
    const result = generateSuggestedDiff(staticTailwind);
    if (result.kind !== "suggestion") throw new Error("expected suggestion");
    const summary = toSuggestedDiffSummary(result.suggestion);
    expect(summary.diff).toBe(result.suggestion.diff);
    expect(summary.confidence).toBe(result.suggestion.confidence);
    // The context-compiler summary is inert data; it carries no apply flag.
    expect("applied" in summary).toBe(false);
  });
});

describe("SuggestedDiffResult type narrowing", () => {
  it("the agent-required branch carries a non-empty reason", () => {
    const dynamic: StaticEditIntent = { ...staticTailwind, ownership: "dynamic" };
    const result: SuggestedDiffResult = generateSuggestedDiff(dynamic);
    if (result.kind === "agent-required") {
      const ar: AgentRequiredResult = result;
      expect(ar.reason.length).toBeGreaterThan(0);
    } else {
      throw new Error("expected agent-required branch");
    }
  });

  it("the suggestion branch carries a complete SuggestedDiff", () => {
    const result: SuggestedDiffResult = generateSuggestedDiff(staticTailwind);
    if (result.kind === "suggestion") {
      const s: SuggestedDiff = result.suggestion;
      expect(s.diff.length).toBeGreaterThan(0);
      expect(s.sourceRanges.length).toBeGreaterThan(0);
    } else {
      throw new Error("expected suggestion branch");
    }
  });
});
