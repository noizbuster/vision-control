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

import type { BreakpointOperation, ChangeSet } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type { SourceCandidate } from "@vision-control/source-resolver";

import {
  type BreakpointContext,
  CONTEXT_FORMAT_VERSION,
  type CompiledContext,
  type ComponentPropsSummary,
  DEFAULT_TOKEN_BUDGET,
  type LayoutContextSummary,
  type MultiSelectSummary,
  type ScreenshotRedactionSummary,
  type ScreenshotRefSummary,
  type SourceCandidateSummary,
  type SourceConfidenceDetail,
  type SourceSummary,
  STUB_VERIFICATION_PLAN,
  type SuggestedDiffSummary,
  type TargetSummary,
  type TokenRegistrySummary,
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
  /** V1: the multi-selection group in scope (absent for single-element edits). */
  readonly multiSelect?: MultiSelectSummary;
  /** V1: the active responsive breakpoint context. */
  readonly breakpoint?: BreakpointContext;
  /** V1: detail behind the source-confidence level. */
  readonly sourceConfidenceDetail?: SourceConfidenceDetail;
  /** V1 (opt-in only): screenshot artifact metadata ref. Never image bytes. */
  readonly screenshotRef?: ScreenshotRefSummary;
  /**
   * V1 (ADR-011): explicit opt-in gate for screenshot metadata. Must be `true`
   * for `screenshotRef` to be emitted. Without it, `screenshotRef` is dropped
   * even if a caller supplied one — the misleading-success-output defense.
   */
  readonly screenshotOptIn?: boolean;
  /** V1 (inert): deterministic patch suggestions surfaced as candidate data. */
  readonly suggestedDiffs?: readonly SuggestedDiffSummary[];
  /** V1: grid / auto-layout context. */
  readonly layoutContext?: LayoutContextSummary;
  /** V1: warnings emitted by styling/framework source adapters. */
  readonly adapterWarnings?: readonly Warning[];
  /** V1 (VC-V1V2-18): design-token registry summary for agent context. */
  readonly tokenRegistry?: TokenRegistrySummary;
  /** V1 (VC-V1V2-21): discovered component props for prop-editing context. */
  readonly componentProps?: ComponentPropsSummary;
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
    ...(inputs.multiSelect !== undefined ? { multiSelect: inputs.multiSelect } : {}),
    ...(resolveBreakpoint(inputs.breakpoint, inputs.changeset) ?? {}),
    ...(inputs.sourceConfidenceDetail !== undefined
      ? { sourceConfidenceDetail: inputs.sourceConfidenceDetail }
      : {}),
    ...(inputs.screenshotOptIn === true && inputs.screenshotRef !== undefined
      ? { screenshotRef: projectScreenshotRef(inputs.screenshotRef) }
      : {}),
    ...(inputs.suggestedDiffs !== undefined
      ? { suggestedDiffs: inputs.suggestedDiffs.map(projectSuggestedDiff) }
      : {}),
    ...(inputs.layoutContext !== undefined ? { layoutContext: inputs.layoutContext } : {}),
    ...(inputs.adapterWarnings !== undefined
      ? { adapterWarnings: [...inputs.adapterWarnings] }
      : {}),
    ...(inputs.tokenRegistry !== undefined ? { tokenRegistry: inputs.tokenRegistry } : {}),
    ...(inputs.componentProps !== undefined ? { componentProps: inputs.componentProps } : {}),
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

/**
 * Project one inert deterministic patch suggestion into the compiled context
 * (VC-V1V2-14 / ADR-012). The suggestion is DATA only — the compiler emits it
 * unchanged (minus undefined optional fields) and never applies it. The richer
 * `kind`/`sourceRanges` fields flow through when the source-resolver generator
 * produced them; a Task-3 baseline summary (diff/confidence/preconditions only)
 * still projects cleanly.
 */
const projectSuggestedDiff = (suggestion: SuggestedDiffSummary): SuggestedDiffSummary => ({
  diff: suggestion.diff,
  confidence: suggestion.confidence,
  preconditions: [...suggestion.preconditions],
  ...(suggestion.kind !== undefined ? { kind: suggestion.kind } : {}),
  ...(suggestion.sourceRanges !== undefined ? { sourceRanges: [...suggestion.sourceRanges] } : {}),
});

/**
 * Project an opt-in screenshot metadata ref (ADR-011). Carries only the artifact
 * id + redaction report/summary — never image bytes. Only reached when the
 * caller explicitly opted in (`screenshotOptIn === true`).
 */
const projectScreenshotRef = (ref: ScreenshotRefSummary): ScreenshotRefSummary => ({
  artifactId: ref.artifactId,
  ...(ref.redactionReport !== undefined ? { redactionReport: ref.redactionReport } : {}),
  ...(ref.redactionSummary !== undefined
    ? { redactionSummary: projectRedactionSummary(ref.redactionSummary) }
    : {}),
});

const projectRedactionSummary = (
  summary: ScreenshotRedactionSummary,
): ScreenshotRedactionSummary => ({
  totalMasked: summary.totalMasked,
  postCaptureRecheck: summary.postCaptureRecheck,
});

/**
 * Resolve the breakpoint context to emit (VC-V1V2-10). When the caller supplies
 * an explicit breakpoint context, it wins (enriched with a scoped change count
 * derived from the changeset). Otherwise, when the changeset contains
 * breakpoint-scoped operations, the context is derived from the first such op:
 * its `activeViewport`/`responsivePrefix` fall back to the breakpoint
 * identifier, and `mediaSource` maps to `mediaQuerySource`. When neither holds,
 * no breakpoint context is emitted.
 */
const resolveBreakpoint = (
  explicit: BreakpointContext | undefined,
  changeset: ChangeSet,
): { breakpoint: BreakpointContext } | undefined => {
  const scopedCount = countBreakpointOps(changeset);
  if (explicit !== undefined) {
    const enriched: BreakpointContext =
      explicit.scopedChangeCount !== undefined
        ? explicit
        : { ...explicit, scopedChangeCount: scopedCount };
    return { breakpoint: enriched };
  }
  const first = firstBreakpointOp(changeset);
  if (first === undefined) return undefined;
  const derived: BreakpointContext = {
    activeViewport: first.activeViewport ?? first.breakpoint,
    ...(first.mediaSource !== undefined ? { mediaQuerySource: first.mediaSource } : {}),
    responsivePrefix: first.responsivePrefix ?? first.breakpoint,
    scopedChangeCount: scopedCount,
  };
  return { breakpoint: derived };
};

const BREAKPOINT_KINDS = new Set([
  "breakpoint-style-edit",
  "breakpoint-class-edit",
  "breakpoint-text-edit",
]);

const isBreakpointOp = (op: ChangeSet["operations"][number]): op is BreakpointOperation =>
  BREAKPOINT_KINDS.has(op.kind);

const countBreakpointOps = (changeset: ChangeSet): number =>
  changeset.operations.reduce((n, op) => n + (BREAKPOINT_KINDS.has(op.kind) ? 1 : 0), 0);

const firstBreakpointOp = (changeset: ChangeSet): BreakpointOperation | undefined => {
  for (const op of changeset.operations) {
    if (isBreakpointOp(op)) return op;
  }
  return undefined;
};
