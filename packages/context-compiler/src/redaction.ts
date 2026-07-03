/**
 * Redaction chokepoint for the compiled context (PRD §16.3 + §27.2 + Appendix D.6).
 *
 * Every compiled context MUST pass through {@link redactContext} before it is
 * rendered to JSON or Markdown and handed to a coding agent. Two complementary
 * layers compose here:
 *
 * 1. DOM/SELECTOR redaction (`redactTarget`) masks values by element SHAPE — a
 *    value is masked because the element IS a password input / autocomplete
 *    credential field / hidden field, or carries `[data-private]`. This runs at
 *    compile time too (so secrets never enter the compiled context); this pass
 *    is a defense-in-depth fallback that catches a context that reached the
 *    chokepoint without compile-time masking (e.g. raw JSON parsed from store).
 *    It is idempotent: a value already carrying the redaction marker is skipped
 *    and never re-counted.
 * 2. STRING-PATTERN redaction (`redactObject`) masks secrets by CONTENT —
 *    cookies, auth headers, password assignments, JWTs, API keys, high-entropy
 *    tokens — anywhere in the document.
 *
 * Default-deny posture (PRD §16.3): `localStorage`, `sessionStorage`, cookie
 * values, and auth headers are ABSENT from {@link CompiledContextSchema} by
 * construction — the agent context simply has no field that could carry them.
 * The two layers above handle the element-level and string-level surfaces the
 * schema cannot encode. Renderers trust their input is already redacted.
 */

import {
  createPrivacyReport,
  redactObject,
  type PrivacyReportRedaction as SecurityPrivacyReportRedaction,
} from "@vision-control/security";

import type { CompiledContext, PrivacyReport, PrivacyReportRedaction } from "./context-schema.js";
import { type RedactionConfig, redactTarget, resolveSelectorRules } from "./redaction-selectors.js";

/**
 * Return a deep-redacted copy of `context` with an updated privacy report. The
 * input is never mutated. The returned `privacyReport` merges three sources:
 * the compile-time selector redactions already on `context.privacyReport`, any
 * NEW selector redactions this pass applies (defense-in-depth, usually empty),
 * and the string-pattern redactions found by diffing. The report never carries
 * the original secret values — only paths, rule ids, and reasons.
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
  const afterSelectors: CompiledContext = { ...context, target: selectorMaskedTarget };
  const redacted = redactObject(afterSelectors) as CompiledContext;
  const stringReport = createPrivacyReport(afterSelectors, redacted);
  const compileTimeRedactions = context.privacyReport.redactions;
  const merged: PrivacyReport = {
    redactions: [
      ...compileTimeRedactions,
      ...selectorRedactions,
      ...stringReport.redactions.map(toContextRedaction),
    ],
    totalRedacted:
      compileTimeRedactions.length + selectorRedactions.length + stringReport.totalRedacted,
  };
  return { ...redacted, privacyReport: merged };
};

const toContextRedaction = (entry: SecurityPrivacyReportRedaction): PrivacyReportRedaction => ({
  field: entry.field,
  patternId: entry.patternId,
  description: entry.description,
  source: "string-pattern",
});
