import type { SuggestedDiff } from "@vision-control/source-resolver";
import { describe, expect, it } from "vitest";

import { formatDiffPreview, renderDiffPreview } from "./diff-preview.js";

function sampleSuggestion(overrides: Partial<SuggestedDiff> = {}): SuggestedDiff {
  return {
    kind: "tailwind-token-replace",
    filePath: "src/Button.tsx",
    diff: [
      "--- a/src/Button.tsx",
      "+++ b/src/Button.tsx",
      "@@ -10,1 +10,1 @@",
      '-  <button className="px-3">Save</button>',
      '+  <button className="px-4">Save</button>',
    ].join("\n"),
    sourceRanges: [{ startLine: 10, startColumn: 0, endLine: 10, endColumn: 30 }],
    confidence: "high",
    preconditions: ["Verify the className is present after HMR."],
    ...overrides,
  };
}

describe("codemod diff-preview formatDiffPreview", () => {
  it("includes the suggestion kind, file path, and confidence in header lines", () => {
    const preview = formatDiffPreview(sampleSuggestion());
    const headerTexts = preview.lines.filter((l) => l.kind === "header").map((l) => l.text);
    expect(headerTexts.some((t) => t.includes("tailwind-token-replace"))).toBe(true);
    expect(headerTexts.some((t) => t.includes("src/Button.tsx"))).toBe(true);
    expect(headerTexts.some((t) => t.includes("high"))).toBe(true);
  });

  it("classifies diff addition and removal lines correctly", () => {
    const preview = formatDiffPreview(sampleSuggestion());
    const additions = preview.lines.filter((l) => l.kind === "addition");
    const removals = preview.lines.filter((l) => l.kind === "removal");
    expect(additions.length).toBe(1);
    expect(removals.length).toBe(1);
    expect(additions[0]?.text).toContain("px-4");
    expect(removals[0]?.text).toContain("px-3");
  });

  it("classifies diff header lines (--- / +++) as context, not addition/removal", () => {
    const preview = formatDiffPreview(sampleSuggestion());
    const fileHeaders = preview.lines.filter(
      (l) => l.text.startsWith("---") || l.text.startsWith("+++"),
    );
    expect(fileHeaders.length).toBe(2);
    expect(fileHeaders.every((l) => l.kind === "context")).toBe(true);
  });

  it("includes preconditions as dedicated precondition lines", () => {
    const preview = formatDiffPreview(
      sampleSuggestion({
        preconditions: ["Verify after HMR.", "Verify no dynamic override."],
      }),
    );
    const preconditionLines = preview.lines.filter((l) => l.kind === "precondition");
    expect(preconditionLines).toHaveLength(2);
    expect(preconditionLines[0]?.text).toContain("Verify after HMR.");
    expect(preconditionLines[1]?.text).toContain("Verify no dynamic override.");
  });

  it("handles an empty precondition list without error", () => {
    const preview = formatDiffPreview(sampleSuggestion({ preconditions: [] }));
    const preconditionLines = preview.lines.filter((l) => l.kind === "precondition");
    expect(preconditionLines).toHaveLength(0);
  });

  it("handles a multi-line diff hunk (reorder with multiple removals/additions)", () => {
    const multiLineDiff = [
      "--- a/src/List.tsx",
      "+++ b/src/List.tsx",
      "@@ -5,3 +5,3 @@",
      "-<li>A</li>",
      "-<li>B</li>",
      "-<li>C</li>",
      "+<li>C</li>",
      "+<li>A</li>",
      "+<li>B</li>",
    ].join("\n");
    const preview = formatDiffPreview(
      sampleSuggestion({
        kind: "simple-reorder",
        filePath: "src/List.tsx",
        diff: multiLineDiff,
      }),
    );
    const additions = preview.lines.filter((l) => l.kind === "addition");
    const removals = preview.lines.filter((l) => l.kind === "removal");
    expect(additions).toHaveLength(3);
    expect(removals).toHaveLength(3);
  });
});

describe("codemod diff-preview renderDiffPreview", () => {
  it("renders the preview as a single string with all lines joined by newlines", () => {
    const text = renderDiffPreview(sampleSuggestion());
    expect(text).toContain("tailwind-token-replace");
    expect(text).toContain("src/Button.tsx");
    expect(text).toContain("+  <button");
    expect(text).toContain("-  <button");
    expect(text).toContain("Verify the className is present after HMR.");
  });

  it("produces non-empty output for any valid suggestion", () => {
    const text = renderDiffPreview(sampleSuggestion({ confidence: "low", preconditions: [] }));
    expect(text.length).toBeGreaterThan(0);
  });
});
