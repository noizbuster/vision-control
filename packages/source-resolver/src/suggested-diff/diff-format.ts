import { z } from "zod";

import type { SuggestionKind } from "./kinds.js";

/**
 * Inert deterministic patch suggestion data shapes (VC-V1V2-14 / ADR-012).
 *
 * A `SuggestedDiff` is CANDIDATE DATA, never an applied change. It carries the
 * unified diff text, the source ranges it applies to, a confidence level, and
 * preconditions the consumer (a coding agent or a human) MUST verify after HMR.
 * Nothing in this module writes source — the consumer applies the diff through
 * its own file-writing mechanism and then runs the verification loop.
 *
 * This payload is structurally compatible with (but distinct from) the change-IR
 * `suggested-diff` OPERATION (Task 3 added that runtime representation). The
 * operation records an applied/inert lifecycle in a ChangeSet; this payload is
 * the inert candidate the generator emits BEFORE any operation is created.
 */

/** A `[startLine, startColumn, endLine, endColumn]` source range. */
export interface SourceRange {
  /** 1-based start line. */
  readonly startLine: number;
  /** 0-based start column. */
  readonly startColumn: number;
  /** 1-based end line. */
  readonly endLine: number;
  /** 0-based end column. */
  readonly endColumn: number;
}

export const SourceRangeSchema = z.object({
  startLine: z.number().int().positive(),
  startColumn: z.number().int().nonnegative(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().nonnegative(),
});

/** Confidence that the suggestion's source ownership is correct. */
export type SuggestionConfidence = "high" | "medium" | "low";

export const SuggestionConfidenceSchema = z.enum(["high", "medium", "low"]);

/**
 * One inert deterministic patch suggestion. `applied` is deliberately absent —
 * the payload is data, not a lifecycle record (ADR-012). The runtime change-IR
 * operation tracks the applied flag; this payload does not.
 */
export interface SuggestedDiff {
  readonly kind: SuggestionKind;
  /** Workspace-relative path the diff applies to. */
  readonly filePath: string;
  /** Unified diff text (`--- a/..` / `+++ b/..` / `@@ -L,N +L,N @@` / `-`/`+`). */
  readonly diff: string;
  /** Source ranges the diff touches (1+; multi-range for reorder edits). */
  readonly sourceRanges: readonly SourceRange[];
  readonly confidence: SuggestionConfidence;
  /** Preconditions the consumer MUST verify after HMR. */
  readonly preconditions: readonly string[];
}

export const SuggestedDiffSchema = z.object({
  kind: z.enum([
    "tailwind-token-replace",
    "css-declaration-replace",
    "css-class-replace",
    "css-modules-local-edit",
    "inline-style-object-edit",
    "jsx-text-edit",
    "simple-reorder",
    "component-prop-edit",
  ]),
  filePath: z.string().min(1),
  diff: z.string(),
  sourceRanges: z.array(SourceRangeSchema).min(1),
  confidence: SuggestionConfidenceSchema,
  preconditions: z.array(z.string()),
});

/**
 * The generator result. A safe static edit yields a `suggestion`; a dynamic or
 * unresolvable edit yields `agent-required` (NO suggestion — the generator does
 * not try to be clever).
 */
export type SuggestedDiffResult =
  | { readonly kind: "suggestion"; readonly suggestion: SuggestedDiff }
  | { readonly kind: "agent-required"; readonly reason: string };

export type AgentRequiredResult = Extract<SuggestedDiffResult, { readonly kind: "agent-required" }>;

/**
 * Build a minimal unified-diff hunk for a single-region edit. Emits the
 * `--- a/<path>` / `+++ b/<path>` headers, one `@@ -startLine,oldCount
 * +startLine,newCount @@` hunk header, and the `-`/`+` line pairs.
 *
 * Multi-line `oldLine`/`newLine` (newline-separated) produce a multi-line hunk,
 * which is how reorder edits are represented.
 */
export interface BuildUnifiedDiffInput {
  readonly filePath: string;
  readonly range: SourceRange;
  /** The full source line(s) before the edit. Multi-line values use `\n`. */
  readonly oldLine: string;
  /** The full source line(s) after the edit. Multi-line values use `\n`. */
  readonly newLine: string;
}

export const buildUnifiedDiff = (input: BuildUnifiedDiffInput): string => {
  const oldLines = input.oldLine.length === 0 ? [] : input.oldLine.split("\n");
  const newLines = input.newLine.length === 0 ? [] : input.newLine.split("\n");
  const startLine = input.range.startLine;
  const hunks: string[] = [
    `--- a/${input.filePath}`,
    `+++ b/${input.filePath}`,
    `@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ];
  return hunks.join("\n");
};
