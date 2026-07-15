/**
 * @vision-control/context-compiler — public API.
 *
 * Compiles a redacted, token-budgeted agent context from an inspector selection
 * summary, a change set, source candidates, and collected warnings. The typical
 * pipeline is:
 *
 * ```ts
 * const context = compileContext(inputs); // assemble + budget
 * const safe = redactContext(context);    // scrub secrets + privacy report
 * const json = renderJson(safe);          // or renderMarkdown(safe)
 * // Portable snapshots redact inside compile (ADR-009):
 * const snapshot = compileVisionContextSnapshot(inputs);
 * ```
 *
 * Platform: isomorphic. No DOM or filesystem access. The inspector-core and
 * source-resolver types are consumed type-only (devDependencies); only
 * isomorphic packages (`change-ir`, `security`, `verification-engine`) and
 * `zod` are runtime deps. Portable snapshots compile without workspaceRoot.
 */

export const PACKAGE_NAME = "@vision-control/context-compiler";

export {
  type ComputeChangesetPrivacyReportOptions,
  computeChangesetPrivacyReport,
} from "./changeset-privacy.js";
export { type CompileContextInputs, compileContext } from "./compiler.js";
export * from "./context-schema.js";
export { redactContext, redactVisionContextSnapshot } from "./redaction.js";
export {
  DEFAULT_REDACTION_SELECTORS,
  type ElementMatchDescriptor,
  ElementMatchDescriptorSchema,
  type RedactionAction,
  type RedactionConfig,
  RedactionConfigSchema,
  type RedactionSelectorRule,
  RedactionSelectorRuleSchema,
  redactTarget,
  resolveSelectorRules,
} from "./redaction-selectors.js";
export { renderJson } from "./renderers/json-renderer.js";
export { renderMarkdown } from "./renderers/markdown-renderer.js";
export {
  type CompileSnapshotInputs,
  compileVisionContextSnapshot,
} from "./snapshot-compiler.js";
export {
  EMPTY_JOURNAL_SUMMARY,
  EMPTY_PRIVACY_REPORT,
  type JournalSummary,
  JournalSummarySchema,
  type MapOrigin,
  MapOriginSchema,
  SNAPSHOT_FORMAT_VERSION,
  type VisionContextSnapshot,
  VisionContextSnapshotSchema,
} from "./snapshot-schema.js";
export { projectSelectionToTarget } from "./target-projection.js";
export { TokenBudget } from "./token-budget.js";
