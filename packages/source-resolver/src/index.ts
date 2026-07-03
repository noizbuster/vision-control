/**
 * @vision-control/source-resolver — public API.
 *
 * Resolves a {@link SelectionIdentity} (from the inspector) to a
 * {@link SourceCandidate} that the context compiler and MCP server hand to a
 * coding agent.
 *
 * VC-V1V2-04 introduces the adapter/confidence contract: the resolver collects
 * candidates from the built-in marker/CSS cascade PLUS any registered
 * {@link SourceAdapter}s, enforces the never-wrong-HIGH policy on every
 * candidate, ranks them (HIGH > MEDIUM > LOW), and flags the winner
 * `selected: true`. The confidence-ui-data shape flows through the context
 * compiler to MCP responses (the UI itself lands in VC-V1V2-10).
 *
 * Resolution priority: source marker (high) → stale registry (medium) → static
 * CSS class (medium) → registered adapters → low-confidence fallback (low). The
 * resolver NEVER returns a wrong HIGH-confidence result.
 *
 * Platform: node — the snippet extractor reads source files via `node:fs`.
 * SECURITY: every path in a {@link SourceCandidate} is workspace-relative.
 */

export type { AdapterContext, SourceAdapter } from "./adapter-contract.js";
export { AdapterRegistry } from "./adapter-registry.js";
// VC-V1V2-21: component props editing with safe source ownership rules.
export * from "./component-props/index.js";
export {
  CONFIDENCE_EVIDENCE,
  CONFIDENCE_RANK,
  type Confidence,
  type ConfidenceEvidence,
  ConfidenceEvidenceSchema,
  ConfidenceSchema,
  compareConfidence,
  satisfiesHighEvidence,
} from "./confidence.js";
export {
  buildConfidenceUiData,
  type ConfidenceCandidateView,
  ConfidenceCandidateViewSchema,
  type ConfidenceUiData,
  ConfidenceUiDataSchema,
} from "./confidence-ui-data.js";
// VC-V1V2-20: CSS-in-JS static-extraction adapter + pseudo-element editing.
export * from "./css-in-js/index.js";
export { type ResolveOptions, SourceResolver, type SourceResolverOptions } from "./resolver.js";
export { extractSnippet, MAX_SNIPPET_LINES } from "./snippet-extractor.js";
export {
  createSourceCandidate,
  enforceNeverWrongHigh,
  hasSourceRange,
  type SourceCandidate,
  SourceCandidateSchema,
  type SourceConfidence,
} from "./source-candidate.js";
export { isStaleEntry } from "./stale-detection.js";
export {
  buildUnifiedDiff,
  generateSuggestedDiff,
  type SourceRange,
  type StaticEditIntent,
  SUGGESTION_KINDS,
  type SuggestedDiff,
  type SuggestedDiffResult,
  SuggestedDiffSchema,
  type SuggestedDiffSummaryLike,
  type SuggestionKind,
  type SuggestionOwnership,
  toSuggestedDiffSummary,
} from "./suggested-diff/index.js";
// VC-V1V2-18: framework-agnostic design-token registry (categories, provenance,
// conflict detection, runtime CSS-variable resolution, context summaries).
export * from "./tokens/index.js";
export {
  CSS_IN_JS_ADAPTER,
  CSS_MODULES_ADAPTER,
  CSS_MODULES_STUB,
  checkCssModulesSupport,
  checkTailwindTokenSupport,
  NEXT_ADAPTER,
  SVELTE_ADAPTER,
  TAILWIND_TOKEN_ADAPTER,
  TAILWIND_TOKEN_STUB,
  V1_NOT_IMPLEMENTED_ADAPTERS,
  type V1StubResult,
  VANILLA_CSS_ADAPTER,
  VUE_ADAPTER,
} from "./v1-stubs.js";
