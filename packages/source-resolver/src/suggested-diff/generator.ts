import { type ConfidenceEvidence, satisfiesHighEvidence } from "../confidence.js";
import {
  buildUnifiedDiff,
  type SourceRange,
  type SuggestedDiff,
  type SuggestedDiffResult,
} from "./diff-format.js";
import type { SuggestionKind } from "./kinds.js";
import { preconditionsFor } from "./preconditions.js";

/**
 * Deterministic patch suggestion generator (VC-V1V2-14 / ADR-012).
 *
 * Given a safe static edit intent, the generator produces an inert
 * {@link SuggestedDiff} payload (diff text + source ranges + confidence +
 * preconditions) OR an "agent-required" signal when the edit is dynamic /
 * unresolvable. The generator never writes source and never tries to be clever:
 * a dynamic `props.className` or a computed CSS-in-JS value returns
 * agent-required, not a guessed patch.
 *
 * Confidence mirrors the never-wrong-HIGH policy (VC-V1V2-04): HIGH requires
 * strong evidence (ast-origin / marker, or a qualifying pair) AND a concrete
 * source range. Text-search-backed edits are MEDIUM; ambiguous edits are LOW;
 * dynamic edits produce no suggestion at all.
 */

/**
 * How clearly the edit site owns its source location. Drives confidence.
 *
 * - `unambiguous` — AST analysis (or a marker) pinned the exact source site.
 *   HIGH when the cited evidence satisfies the never-wrong-HIGH predicate.
 * - `text-backed` — a text search located the edit site but AST ownership is
 *   not proven. MEDIUM.
 * - `ambiguous` — multiple candidate sites exist. LOW.
 * - `dynamic` — the value is computed/conditional/prop-driven. NO suggestion;
 *   agent-required.
 */
export type SuggestionOwnership = "unambiguous" | "text-backed" | "ambiguous" | "dynamic";

/**
 * One static edit intent. The generator consumes this and decides whether a
 * deterministic suggestion is safe to emit.
 *
 * `oldValue`/`newValue` are the literal token/declaration values being swapped.
 * `oldLine`/`newLine` are the full source line(s) for diff context (defaults to
 * the value itself when the caller only has the token).
 */
export interface StaticEditIntent {
  readonly kind: SuggestionKind;
  /** Workspace-relative path of the file the edit targets. */
  readonly filePath: string;
  /** Literal value currently at the edit site (e.g. `px-3`). */
  readonly oldValue: string;
  /** Literal value desired at the edit site (e.g. `px-4`). */
  readonly newValue: string;
  /** Source range of the region the edit replaces. Required for a suggestion. */
  readonly sourceRange?: SourceRange;
  /** Full source line(s) before the edit; defaults to `oldValue`. */
  readonly oldLine?: string;
  /** Full source line(s) after the edit; defaults to `newValue`. */
  readonly newLine?: string;
  /** Evidence methods backing the ownership claim. */
  readonly evidence?: readonly ConfidenceEvidence[];
  readonly ownership: SuggestionOwnership;
  // --- optional per-kind context (used for precondition / summary text) ---
  readonly className?: string;
  readonly cssProperty?: string;
  readonly parentSelector?: string;
  readonly fromIndex?: number;
  readonly toIndex?: number;
  /** VC-V1V2-21: component name for component-prop-edit suggestions. */
  readonly componentName?: string;
  /** VC-V1V2-21: prop name for component-prop-edit suggestions. */
  readonly propName?: string;
}

const rangeIsValid = (range: SourceRange | undefined): range is SourceRange =>
  range !== undefined &&
  Number.isInteger(range.startLine) &&
  range.startLine >= 1 &&
  Number.isInteger(range.endLine) &&
  range.endLine >= range.startLine &&
  Number.isInteger(range.startColumn) &&
  range.startColumn >= 0 &&
  Number.isInteger(range.endColumn) &&
  range.endColumn >= 0;

/**
 * Compute the confidence for a non-dynamic intent, applying the never-wrong-HIGH
 * rule. Returns `undefined` only when a suggestion is impossible (missing or
 * invalid range).
 */
const computeConfidence = (intent: StaticEditIntent): "high" | "medium" | "low" | undefined => {
  if (!rangeIsValid(intent.sourceRange)) return undefined;
  const evidence = intent.evidence ?? [];
  switch (intent.ownership) {
    case "unambiguous":
      // HIGH only when the cited evidence qualifies under never-wrong-HIGH.
      return satisfiesHighEvidence(evidence, true) ? "high" : "medium";
    case "text-backed":
      return "medium";
    case "ambiguous":
      return "low";
    default:
      return undefined;
  }
};

/** True when the intent has no real edit to suggest (identity or empty). */
const isNoOp = (intent: StaticEditIntent): boolean =>
  intent.oldValue === intent.newValue ||
  (intent.oldValue.length === 0 && intent.newValue.length === 0);

/**
 * Generate an inert deterministic patch suggestion for a static edit intent.
 *
 * Returns `{ kind: "suggestion", suggestion }` for safe static edits with a
 * valid source range, or `{ kind: "agent-required", reason }` for dynamic /
 * unresolvable edits. The reason string explains why no suggestion was emitted.
 */
export const generateSuggestedDiff = (intent: StaticEditIntent): SuggestedDiffResult => {
  // Dynamic / computed edits never produce a suggestion (the generator does not
  // guess). This is the load-bearing agent-required contract (ADR-012).
  if (intent.ownership === "dynamic") {
    return {
      kind: "agent-required",
      reason: `edit is dynamic or computed (${describeDynamic(intent)}); a deterministic patch cannot be safely generated — agent reasoning required`,
    };
  }
  // A no-op (empty old AND new) is not an edit.
  if (isNoOp(intent)) {
    return {
      kind: "agent-required",
      reason: "intent has no effect (oldValue and newValue are both empty); nothing to suggest",
    };
  }
  // An empty filePath cannot anchor a deterministic diff.
  if (intent.filePath.length === 0) {
    return {
      kind: "agent-required",
      reason:
        "filePath is empty; a deterministic suggestion requires a workspace-relative source path",
    };
  }
  const range = intent.sourceRange;
  if (!rangeIsValid(range)) {
    return {
      kind: "agent-required",
      reason:
        "a valid source range is required for a deterministic suggestion (range is missing, absent, or endLine precedes startLine)",
    };
  }
  const confidence = computeConfidence(intent);
  if (confidence === undefined) {
    return {
      kind: "agent-required",
      reason:
        "a valid source range is required for a deterministic suggestion (range is missing, absent, or endLine precedes startLine)",
    };
  }
  const diff = buildUnifiedDiff({
    filePath: intent.filePath,
    range,
    oldLine: intent.oldLine ?? intent.oldValue,
    newLine: intent.newLine ?? intent.newValue,
  });
  const suggestion: SuggestedDiff = {
    kind: intent.kind,
    filePath: intent.filePath,
    diff,
    sourceRanges: [range],
    confidence,
    preconditions: preconditionsFor(intent.kind),
  };
  return { kind: "suggestion", suggestion };
};

const describeDynamic = (intent: StaticEditIntent): string => {
  if (intent.componentName !== undefined && intent.propName !== undefined) {
    return `${intent.componentName} prop "${intent.propName}"`;
  }
  if (intent.className !== undefined) return `className=${intent.className}`;
  return `ownership=dynamic`;
};

/**
 * The context-compiler projection of a suggestion. Structurally compatible with
 * `@vision-control/context-compiler`'s `SuggestedDiffSummary` (the compiler
 * defines its own schema; this local shape is assignable to it by structural
 * typing). Kept here so the generator's home owns the projection and
 * context-compiler stays free of a source-resolver runtime dependency.
 */
export interface SuggestedDiffSummaryLike {
  readonly diff: string;
  readonly confidence: "high" | "medium" | "low";
  readonly preconditions: readonly string[];
  readonly kind?: SuggestionKind;
  readonly sourceRanges?: readonly SourceRange[];
}

/**
 * Project a {@link SuggestedDiff} to the inert summary shape the context
 * compiler emits and the MCP server returns. The summary carries no apply flag
 * (ADR-012) — it is pure candidate data.
 */
export const toSuggestedDiffSummary = (suggestion: SuggestedDiff): SuggestedDiffSummaryLike => ({
  diff: suggestion.diff,
  confidence: suggestion.confidence,
  preconditions: [...suggestion.preconditions],
  kind: suggestion.kind,
  sourceRanges: [...suggestion.sourceRanges],
});
