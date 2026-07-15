/**
 * Redaction chokepoints for agent-facing documents (PRD §16.3 + §27.2 + ADR-009).
 *
 * Every {@link CompiledContext} MUST pass through {@link redactContext} before
 * JSON/Markdown export. Every {@link VisionContextSnapshot} MUST pass through
 * {@link redactVisionContextSnapshot} before panel export or MCP projection
 * (`compileVisionContextSnapshot` applies this automatically).
 *
 * Two complementary layers compose:
 *
 * 1. DOM/SELECTOR redaction (`redactTarget`) masks values by element SHAPE — a
 *    value is masked because the element IS a password input / autocomplete
 *    credential field / hidden field, or carries `[data-private]`. Idempotent:
 *    a value already carrying the redaction marker is skipped and never
 *    re-counted.
 * 2. STRING-PATTERN redaction (`redactObject`) masks secrets by CONTENT —
 *    cookies, auth headers, password assignments, JWTs, API keys, high-entropy
 *    tokens — anywhere in the document.
 *
 * The privacy report never carries original secret values — only paths, rule
 * ids, and reasons.
 */

import {
  createPrivacyReport,
  redactObject,
  type PrivacyReportRedaction as SecurityPrivacyReportRedaction,
} from "@vision-control/security";

import type { CompiledContext, PrivacyReport, PrivacyReportRedaction } from "./context-schema.js";
import { type RedactionConfig, redactTarget, resolveSelectorRules } from "./redaction-selectors.js";
import type { VisionContextSnapshot } from "./snapshot-schema.js";

/**
 * Return a deep-redacted copy of `context` with an updated privacy report. The
 * input is never mutated. The returned `privacyReport` merges three sources:
 * the compile-time selector redactions already on `context.privacyReport`, any
 * NEW selector redactions this pass applies (defense-in-depth, usually empty),
 * and the string-pattern redactions found by diffing.
 */
export const redactContext = (
  context: CompiledContext,
  redactionConfig?: RedactionConfig,
): CompiledContext => {
  const rules = resolveSelectorRules(redactionConfig);
  const { target: selectorMaskedTarget, redactions: selectorRedactions } = redactTarget(
    context.target,
    rules,
  );
  // Exclude privacyReport from the string-pattern surface: rule descriptions
  // intentionally mention patterns like `api_key=...` and must not re-match.
  const { privacyReport: priorReport, ...surface } = {
    ...context,
    target: selectorMaskedTarget,
  };
  const redactedSurface = redactObject(surface) as Omit<CompiledContext, "privacyReport">;
  const stringReport = createPrivacyReport(surface, redactedSurface);
  return {
    ...redactedSurface,
    privacyReport: mergePrivacyReport(
      priorReport.redactions,
      selectorRedactions,
      stringReport.redactions,
    ),
  };
};

/**
 * ADR-009 chokepoint for portable snapshots. Selector-masks `selection` when
 * present, then deep-redacts the whole document with `redactObject`, and
 * rebuilds `privacyReport`. Input is never mutated. Safe to re-run (idempotent
 * on already-masked values).
 */
export const redactVisionContextSnapshot = (
  snapshot: VisionContextSnapshot,
  redactionConfig?: RedactionConfig,
): VisionContextSnapshot => {
  const rules = resolveSelectorRules(redactionConfig);
  let afterSelectors = snapshot;
  let selectorRedactions: readonly PrivacyReportRedaction[] = [];

  if (snapshot.selection !== undefined) {
    const { target, redactions } = redactTarget(snapshot.selection, rules);
    afterSelectors = { ...snapshot, selection: target };
    selectorRedactions = redactions.map(toSelectionFieldPath);
  }

  // Exclude privacyReport from the string-pattern surface (see redactContext).
  const { privacyReport: priorReport, ...surface } = afterSelectors;
  const redactedSurface = redactObject(surface) as Omit<VisionContextSnapshot, "privacyReport">;
  const stringReport = createPrivacyReport(surface, redactedSurface);
  return {
    ...redactedSurface,
    privacyReport: mergePrivacyReport(
      priorReport.redactions,
      selectorRedactions,
      stringReport.redactions,
    ),
  };
};

const mergePrivacyReport = (
  compileTime: readonly PrivacyReportRedaction[],
  selector: readonly PrivacyReportRedaction[],
  stringPattern: readonly SecurityPrivacyReportRedaction[],
): PrivacyReport => {
  const stringEntries = stringPattern.map(toContextRedaction);
  return {
    redactions: [...compileTime, ...selector, ...stringEntries],
    totalRedacted: compileTime.length + selector.length + stringEntries.length,
  };
};

const toContextRedaction = (entry: SecurityPrivacyReportRedaction): PrivacyReportRedaction => ({
  field: entry.field,
  patternId: entry.patternId,
  description: entry.description,
  source: "string-pattern",
});

/** `redactTarget` reports `target.*` paths; snapshot selection lives under `selection`. */
const toSelectionFieldPath = (entry: PrivacyReportRedaction): PrivacyReportRedaction => ({
  ...entry,
  field: entry.field.startsWith("target.")
    ? `selection.${entry.field.slice("target.".length)}`
    : entry.field,
});
