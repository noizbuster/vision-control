import { describe, expect, it } from "vitest";

import {
  buildConfidenceUiData,
  type ConfidenceCandidateView,
  type ConfidenceUiData,
  ConfidenceUiDataSchema,
} from "./confidence-ui-data.js";
import { createSourceCandidate } from "./source-candidate.js";

/**
 * VC-V1V2-10 — complete the confidence-ui-data shape. Task 4 built the skeleton
 * (method/reason/selected/alternatives/repeated/stale). This pins the completed
 * shape: every field the UI must render (including the source snippet) projects
 * correctly, and the shape validates against its Zod schema.
 */

const selected = createSourceCandidate({
  sourceId: "sel",
  workspaceRelativePath: "src/Button.tsx",
  componentName: "Button",
  snippet: "export function Button() {\n  return <button />;\n}",
  startLine: 5,
  endLine: 7,
  confidence: "high",
  evidence: ["marker"],
  warnings: [],
  selected: true,
  alternativeCount: 2,
});

const altA = createSourceCandidate({
  sourceId: "alt-a",
  workspaceRelativePath: "src/Button.module.css",
  staticClassName: ".btn",
  cssFilePath: "src/Button.module.css",
  snippet: ".btn { padding: 8px; }",
  confidence: "medium",
  evidence: ["text-search"],
  warnings: ["text-only match", "ownership risk: dynamic class"],
  selected: false,
  alternativeCount: 2,
});

const altB = createSourceCandidate({
  sourceId: "alt-b",
  workspaceRelativePath: "src/legacy.tsx",
  confidence: "low",
  evidence: ["llm-inference"],
  warnings: ["llm-inferred origin"],
  selected: false,
  alternativeCount: 2,
});

describe("confidence-ui-data — completed shape projects every UI field", () => {
  it("projects the selected candidate with method badge, reason badges, and snippet", () => {
    const ui = buildConfidenceUiData([selected, altA, altB]);
    const view = ui.selected;
    expect(view).toBeDefined();
    expect(view?.confidence).toBe("high");
    expect(view?.methodBadge).toEqual(["marker"]);
    expect(view?.reasonBadges).toEqual([]);
    expect(view?.snippet).toBe("export function Button() {\n  return <button />;\n}");
    expect(view?.workspaceRelativePath).toBe("src/Button.tsx");
    expect(view?.componentName).toBe("Button");
  });

  it("projects every alternative with its own method, reasons, and snippet", () => {
    const ui = buildConfidenceUiData([selected, altA, altB]);
    expect(ui.alternatives).toHaveLength(2);
    const first = ui.alternatives[0];
    expect(first?.methodBadge).toEqual(["text-search"]);
    expect(first?.reasonBadges).toEqual(["text-only match", "ownership risk: dynamic class"]);
    expect(first?.snippet).toBe(".btn { padding: 8px; }");
    expect(first?.confidence).toBe("medium");
    const second = ui.alternatives[1];
    expect(second?.confidence).toBe("low");
    expect(second?.methodBadge).toEqual(["llm-inference"]);
  });

  it("flags repeated-instance and stale-fingerprint from the selected warnings", () => {
    const repeatedAndStale = createSourceCandidate({
      confidence: "medium",
      evidence: ["marker"],
      warnings: [
        "repeated instance: 3 elements share source id",
        "stale fingerprint: DOM path changed since last resolve",
      ],
      selected: true,
      alternativeCount: 0,
    });
    const ui = buildConfidenceUiData([repeatedAndStale]);
    expect(ui.repeatedInstance).toBe(true);
    expect(ui.staleFingerprint).toBe(true);
    expect(ui.ambiguous).toBe(false);
  });

  it("the full shape validates against ConfidenceUiDataSchema", () => {
    const ui = buildConfidenceUiData([selected, altA, altB]);
    const result = ConfidenceUiDataSchema.safeParse(ui);
    expect(result.success).toBe(true);
  });

  it("LOW confidence is projected and never hidden (adversarial: misleading-success)", () => {
    const ui = buildConfidenceUiData([selected, altB]);
    const lowView = ui.alternatives[0];
    expect(lowView?.confidence).toBe("low");
    // LOW surfaces with its evidence + warnings intact, not suppressed.
    expect(lowView?.methodBadge).toEqual(["llm-inference"]);
    expect(lowView?.reasonBadges).toEqual(["llm-inferred origin"]);
  });

  it("returns a structurally complete empty shape when no candidates", () => {
    const ui = buildConfidenceUiData([]);
    expect(ui.selected).toBeUndefined();
    expect(ui.alternatives).toEqual([]);
    expect(ui.ambiguous).toBe(false);
    expect(ui.repeatedInstance).toBe(false);
    expect(ui.staleFingerprint).toBe(false);
    expect(ConfidenceUiDataSchema.safeParse(ui).success).toBe(true);
  });

  it("a candidate view never carries undefined snippet explicitly (absent when missing)", () => {
    const noSnippet = createSourceCandidate({
      confidence: "high",
      evidence: ["ast-origin"],
      warnings: [],
      selected: true,
      alternativeCount: 0,
    });
    const ui = buildConfidenceUiData([noSnippet]);
    expect(ui.selected).toBeDefined();
    expect("snippet" in (ui.selected as ConfidenceCandidateView)).toBe(false);
  });
});

describe("confidence-ui-data — ConfidenceUiData type is the UI contract surface", () => {
  it("exposes selected, alternatives, ambiguous, repeatedInstance, staleFingerprint", () => {
    const ui: ConfidenceUiData = buildConfidenceUiData([selected, altA]);
    const keys = Object.keys(ui) as (keyof ConfidenceUiData)[];
    expect(keys).toContain("alternatives");
    expect(keys).toContain("ambiguous");
    expect(keys).toContain("repeatedInstance");
    expect(keys).toContain("staleFingerprint");
    expect(ui.selected).toBeDefined();
  });
});
