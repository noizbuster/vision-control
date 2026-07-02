/**
 * Context compiler: assembles a {@link CompiledContext} from inspector,
 * change-IR, source-resolver, and warning inputs, then applies the token budget.
 *
 * The compiler projects the inspector's `SelectionSummary` into a JSON-safe
 * `TargetSummary` (dropping the live `Element` reference), reduces each change-IR
 * `Operation` to an `OperationSummary`, and collects source candidates and
 * warnings. The assembled context is then truncated to fit the token budget.
 *
 * Privacy: the compiler NEVER performs redaction itself. Redaction is a separate
 * pass (`redactContext`) the caller runs before rendering. This keeps the
 * compiler deterministic and testable, and makes the "everything is redacted
 * before rendering" rule a single chokepoint.
 */

import type { ChangeSet } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type { SourceCandidate } from "@vision-control/source-resolver";

import {
  CONTEXT_FORMAT_VERSION,
  type CompiledContext,
  DEFAULT_TOKEN_BUDGET,
  type SourceCandidateSummary,
  type SourceSummary,
  STUB_VERIFICATION_PLAN,
  type TargetSummary,
  type Warning,
} from "./context-schema.js";
import { summarizeOperation } from "./operation-summary.js";
import { TokenBudget } from "./token-budget.js";

/** Inputs to {@link compileContext}. */
export interface CompileContextInputs {
  /** The user's editing goal, in their own words. Highest-priority content. */
  readonly goal: string;
  /** Inspector selection summary (live `Element` refs are dropped). */
  readonly selection: SelectionSummary;
  /** The change set under review (operations are reduced to summaries). */
  readonly changeset: ChangeSet;
  /** Source candidates resolved for the selected element. */
  readonly sourceCandidates: readonly SourceCandidate[];
  /** Warnings collected from every source. */
  readonly warnings: readonly Warning[];
  /** Max tokens for the compiled context (default {@link DEFAULT_TOKEN_BUDGET}). */
  readonly tokenBudget?: number;
  /** Epoch-ms compilation timestamp (default `Date.now()`). */
  readonly compiledAt?: number;
}

/**
 * Compile a redactable, token-budgeted agent context. The returned context has
 * an empty privacy report; run {@link redactContext} to populate it and scrub
 * secrets before rendering.
 */
export const compileContext = (inputs: CompileContextInputs): CompiledContext => {
  const budget = new TokenBudget(inputs.tokenBudget ?? DEFAULT_TOKEN_BUDGET);
  const target = projectTarget(inputs.selection);
  const operations = inputs.changeset.operations.map(summarizeOperation);
  const source = projectSource(inputs.sourceCandidates);
  const layout = projectLayout(inputs.selection);
  const warnings = [...inputs.warnings];
  const base: CompiledContext = {
    goal: inputs.goal,
    target,
    operations,
    source,
    layout,
    verificationPlan: STUB_VERIFICATION_PLAN,
    warnings,
    privacyReport: { redactions: [], totalRedacted: 0 },
    metadata: {
      compiledAt: inputs.compiledAt ?? Date.now(),
      formatVersion: CONTEXT_FORMAT_VERSION,
      tokenBudget: budget.maxTokens,
      tokenEstimate: 0,
      truncated: false,
      truncatedSections: [],
      operationCount: operations.length,
    },
  };
  const estimated: CompiledContext = {
    ...base,
    metadata: { ...base.metadata, tokenEstimate: budget.estimate(base) },
  };
  return budget.truncate(estimated);
};

/** Project the inspector summary into a JSON-safe target summary. */
const projectTarget = (selection: SelectionSummary): TargetSummary => ({
  identity: {
    ...(selection.identity.runtimeId !== undefined
      ? { runtimeId: selection.identity.runtimeId }
      : {}),
    ...(selection.identity.sourceId !== undefined ? { sourceId: selection.identity.sourceId } : {}),
    ...(selection.identity.fingerprint !== undefined
      ? { fingerprint: selection.identity.fingerprint }
      : {}),
    ...(selection.identity.confidence !== undefined
      ? { confidence: selection.identity.confidence }
      : {}),
    selectors: collectSelectors(selection),
  },
  semantic: {
    tagName: selection.semantic.tagName,
    ...(selection.semantic.role !== undefined ? { role: selection.semantic.role } : {}),
    ...(selection.semantic.name !== undefined ? { name: selection.semantic.name } : {}),
    ...(selection.semantic.description !== undefined
      ? { description: selection.semantic.description }
      : {}),
    textContentPreview: selection.semantic.textContentPreview,
  },
  breadcrumb: selection.breadcrumb.map((item) => ({
    tagName: item.tagName,
    ...(item.id !== undefined ? { id: item.id } : {}),
    ...(item.className !== undefined ? { className: item.className } : {}),
    ...(item.role !== undefined ? { role: item.role } : {}),
    ...(item.selector !== undefined ? { selector: item.selector } : {}),
  })),
  computedStyle: { ...selection.computedStyle },
  boxModel: {
    contentWidth: selection.boxModel.content.width,
    contentHeight: selection.boxModel.content.height,
    positionX: selection.boxModel.position.x,
    positionY: selection.boxModel.position.y,
  },
  classList: selection.classList.map((entry) => ({ name: entry.name, source: entry.source })),
  attributes: selection.attributes.map((entry) => ({ name: entry.name, value: entry.value })),
});

const collectSelectors = (selection: SelectionSummary): string[] => {
  const selectors: string[] = [];
  if (selection.identity.selector !== undefined && selection.identity.selector.length > 0) {
    selectors.push(selection.identity.selector);
  }
  for (const item of selection.breadcrumb) {
    if (
      item.selector !== undefined &&
      item.selector.length > 0 &&
      !selectors.includes(item.selector)
    ) {
      selectors.push(item.selector);
    }
  }
  return selectors;
};

/** Project source-resolver candidates into the context source summary. */
const projectSource = (candidates: readonly SourceCandidate[]): SourceSummary => {
  const projected: SourceCandidateSummary[] = candidates.map(projectCandidate);
  const bestIndex = pickBestIndex(projected);
  return bestIndex !== undefined
    ? { candidates: projected, bestCandidateIndex: bestIndex }
    : { candidates: projected };
};

const projectCandidate = (candidate: SourceCandidate): SourceCandidateSummary => ({
  ...(candidate.workspaceRelativePath !== undefined
    ? { workspaceRelativePath: candidate.workspaceRelativePath }
    : {}),
  ...(candidate.componentName !== undefined ? { componentName: candidate.componentName } : {}),
  ...(candidate.snippet !== undefined ? { snippet: candidate.snippet } : {}),
  ...(candidate.startLine !== undefined ? { startLine: candidate.startLine } : {}),
  ...(candidate.endLine !== undefined ? { endLine: candidate.endLine } : {}),
  confidence: candidate.confidence,
  warnings: [...candidate.warnings],
  ...(candidate.staticClassName !== undefined
    ? { staticClassName: candidate.staticClassName }
    : {}),
  ...(candidate.cssFilePath !== undefined ? { cssFilePath: candidate.cssFilePath } : {}),
});

const pickBestIndex = (candidates: readonly SourceCandidateSummary[]): number | undefined => {
  if (candidates.length === 0) return undefined;
  const rank = { high: 0, medium: 1, low: 2 } as const;
  let bestIndex = 0;
  for (let i = 1; i < candidates.length; i += 1) {
    const current = candidates[i];
    const best = candidates[bestIndex];
    if (
      current !== undefined &&
      best !== undefined &&
      rank[current.confidence] < rank[best.confidence]
    ) {
      bestIndex = i;
    }
  }
  return bestIndex;
};

/** Project parent + sibling layout from the inspector summary. */
const projectLayout = (selection: SelectionSummary): CompiledContext["layout"] => ({
  parentMode: selection.parentLayout.mode,
  parentDisplay: selection.parentLayout.display,
  ...(selection.parentLayout.flexDirection !== undefined
    ? { parentFlexDirection: selection.parentLayout.flexDirection }
    : {}),
  siblingCount: selection.siblingSummary.count,
  siblingIndex: selection.siblingSummary.index,
});
