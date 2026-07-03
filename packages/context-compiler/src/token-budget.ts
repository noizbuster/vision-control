/**
 * Token-budget estimation and priority-ordered truncation.
 *
 * A compiled context must fit a token budget (the default MCP budget is 8000
 * tokens). When the assembled context exceeds the budget, sections are reduced
 * in reverse priority order — the privacy report and warnings go first, the
 * goal and target summary survive longest. The heuristic is deliberately rough
 * (~4 characters per token) so it stays dependency-free and isomorphic; a
 * production tokenizer can be swapped in later without changing the call sites.
 *
 * Priority (high → low, PRD 16.5):
 *   operations > source snippets > parent/target > verification plan >
 *   screenshot > diagnostics (warnings / privacy report)
 *
 * Sections are reduced lowest-priority first; the goal is never modified.
 */

import type { CompiledContext, SourceCandidateSummary } from "./context-schema.js";

/** Approximate characters per token for the rough estimate. */
const CHARS_PER_TOKEN = 4;

/** Maximum snippet length (characters) kept when source is truncated. */
const SNIPPET_TRUNCATE_LENGTH = 200;

export class TokenBudget {
  readonly maxTokens: number;

  constructor(maxTokens: number) {
    this.maxTokens = Math.max(1, Math.floor(maxTokens));
  }

  /** Rough token estimate for an arbitrary JSON-serialisable value. */
  estimate(value: unknown): number {
    const text = JSON.stringify(value) ?? "";
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Return a copy of `context` reduced to fit {@link maxTokens}. Sections are
   * reduced lowest-priority first; the goal is never modified. The returned
   * metadata records which sections were reduced and the new estimate.
   */
  truncate(context: CompiledContext): CompiledContext {
    if (this.estimate(context) <= this.maxTokens) {
      return context;
    }
    const reduced: string[] = [];
    // Each reducer returns a strictly smaller context. Apply in reverse
    // priority order; stop as soon as we are within budget.
    for (const step of REDUCTION_STEPS) {
      const next = step.reduce(context);
      if (next === context) continue; // step had nothing to reduce
      reduced.push(step.section);
      if (this.estimate(next) <= this.maxTokens) {
        return finalize(next, reduced, this);
      }
      context = next;
    }
    return finalize(context, reduced, this);
  }
}

interface ReductionStep {
  /** Section name recorded in `truncatedSections`. */
  readonly section: string;
  /** Pure reducer returning a smaller context, or the same ref if nothing to do. */
  reduce(context: CompiledContext): CompiledContext;
}

const replaceMeta = (
  context: CompiledContext,
  patch: Partial<CompiledContext>,
): CompiledContext => ({ ...context, ...patch });

const reducePrivacyReport = (context: CompiledContext): CompiledContext => {
  if (context.privacyReport.redactions.length === 0) return context;
  return replaceMeta(context, {
    privacyReport: { redactions: [], totalRedacted: context.privacyReport.totalRedacted },
  });
};

const reduceWarnings = (context: CompiledContext): CompiledContext => {
  if (context.warnings.length === 0) return context;
  return replaceMeta(context, { warnings: [] });
};

const reduceVerificationPlan = (context: CompiledContext): CompiledContext => {
  if (context.verificationPlan.assertions.length === 0) return context;
  return replaceMeta(context, {
    verificationPlan: { assertions: [], notes: context.verificationPlan.notes },
  });
};

const reduceLayout = (context: CompiledContext): CompiledContext => {
  const { layout } = context;
  if (layout.parentDisplay === "" && layout.siblingCount === 0) return context;
  return replaceMeta(context, {
    layout: {
      parentMode: "unknown",
      parentDisplay: "",
      siblingCount: 0,
      siblingIndex: 0,
    },
  });
};

const shortenSnippet = (snippet: string): string =>
  snippet.length <= SNIPPET_TRUNCATE_LENGTH
    ? snippet
    : `${snippet.slice(0, SNIPPET_TRUNCATE_LENGTH)}…`;

const reduceSource = (context: CompiledContext): CompiledContext => {
  const candidates = context.source.candidates;
  const shrunk: SourceCandidateSummary[] = candidates.map((candidate) => {
    if (candidate.snippet === undefined) return candidate;
    const shortened = shortenSnippet(candidate.snippet);
    return shortened === candidate.snippet ? candidate : { ...candidate, snippet: shortened };
  });
  if (shrunk === candidates) return context;
  return replaceMeta(context, {
    source: { candidates: shrunk, bestCandidateIndex: context.source.bestCandidateIndex },
  });
};

const reduceOperations = (context: CompiledContext): CompiledContext => {
  if (context.operations.every((op) => op.detail && Object.keys(op.detail).length === 0)) {
    return context;
  }
  return replaceMeta(context, {
    operations: context.operations.map((op) => ({
      id: op.id,
      kind: op.kind,
      runtime: op.runtime,
      description: op.description,
      ...(op.target !== undefined ? { target: op.target } : {}),
      detail: {},
    })),
  });
};

const reduceTarget = (context: CompiledContext): CompiledContext => {
  if (Object.keys(context.target.computedStyle).length === 0) return context;
  return replaceMeta(context, {
    target: { ...context.target, computedStyle: {} },
  });
};

/**
 * Ordered low → high priority: the first entry is reduced first (PRD §16.5).
 * operations survives longest (tier 1); diagnostics go first (tier 6).
 */
const REDUCTION_STEPS: readonly ReductionStep[] = [
  { section: "privacyReport", reduce: reducePrivacyReport },
  { section: "warnings", reduce: reduceWarnings },
  { section: "verificationPlan", reduce: reduceVerificationPlan },
  { section: "layout", reduce: reduceLayout },
  { section: "target", reduce: reduceTarget },
  { section: "source", reduce: reduceSource },
  { section: "operations", reduce: reduceOperations },
];

const finalize = (
  context: CompiledContext,
  reducedSections: readonly string[],
  budget: TokenBudget,
): CompiledContext => ({
  ...context,
  metadata: {
    ...context.metadata,
    tokenBudget: budget.maxTokens,
    tokenEstimate: budget.estimate(context),
    truncated: reducedSections.length > 0,
    truncatedSections: [...reducedSections],
  },
});
