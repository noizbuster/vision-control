import type { SuggestedDiff } from "@vision-control/source-resolver";

/**
 * Codemod diff preview formatting (VC-V1V2-23 / ADR-014).
 *
 * Formats an inert {@link SuggestedDiff} payload for terminal display so the
 * `vision-control codemod preview` command can show the diff and its
 * preconditions WITHOUT writing anything. The preview is pure: it classifies
 * each diff line into a kind (header / addition / removal / context /
 * precondition) so the caller can colorize or filter as needed.
 */

export type DiffPreviewLineKind = "header" | "addition" | "removal" | "context" | "precondition";

export interface DiffPreviewLine {
  readonly text: string;
  readonly kind: DiffPreviewLineKind;
}

export interface DiffPreview {
  readonly lines: readonly DiffPreviewLine[];
}

/**
 * Classify a single unified-diff body line into its preview kind.
 *
 * File headers (`--- a/..`, `+++ b/..`) are context (not addition/removal).
 * Hunk headers (`@@ .. @@`) are context.
 */
const classifyDiffLine = (line: string): DiffPreviewLineKind => {
  if (line.startsWith("---") || line.startsWith("+++")) return "context";
  if (line.startsWith("@@")) return "context";
  if (line.startsWith("+")) return "addition";
  if (line.startsWith("-")) return "removal";
  return "context";
};

/**
 * Format a {@link SuggestedDiff} into a structured preview with classified
 * lines. The caller renders or colorizes the result.
 */
export const formatDiffPreview = (suggestion: SuggestedDiff): DiffPreview => {
  const lines: DiffPreviewLine[] = [
    { text: `Suggestion kind: ${suggestion.kind}`, kind: "header" },
    { text: `File: ${suggestion.filePath}`, kind: "header" },
    { text: `Confidence: ${suggestion.confidence}`, kind: "header" },
  ];

  for (const diffLine of suggestion.diff.split("\n")) {
    lines.push({ text: diffLine, kind: classifyDiffLine(diffLine) });
  }

  for (const precondition of suggestion.preconditions) {
    lines.push({ text: `  precondition: ${precondition}`, kind: "precondition" });
  }

  return { lines };
};

/**
 * Render a {@link SuggestedDiff} preview as a single newline-joined string for
 * direct terminal output.
 */
export const renderDiffPreview = (suggestion: SuggestedDiff): string =>
  formatDiffPreview(suggestion)
    .lines.map((l) => l.text)
    .join("\n");
