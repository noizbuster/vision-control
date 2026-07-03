/**
 * Deterministic patch suggestions as inert data (VC-V1V2-14 / ADR-012).
 *
 * Public barrel for the `suggested-diff` module. The generator produces inert
 * `SuggestedDiff` payloads for safe static edits; the MCP server and context
 * compiler surface them as data only. There is NO apply tool and there will not
 * be one (ADR-010 / ADR-012).
 */

export {
  type AgentRequiredResult,
  type BuildUnifiedDiffInput,
  buildUnifiedDiff,
  type SourceRange,
  SourceRangeSchema,
  type SuggestedDiff,
  type SuggestedDiffResult,
  SuggestedDiffSchema,
  type SuggestionConfidence,
  SuggestionConfidenceSchema,
} from "./diff-format.js";
export {
  generateSuggestedDiff,
  type StaticEditIntent,
  type SuggestedDiffSummaryLike,
  type SuggestionOwnership,
  toSuggestedDiffSummary,
} from "./generator.js";
export { SUGGESTION_KINDS, type SuggestionKind, SuggestionKindSchema } from "./kinds.js";
export { preconditionsFor } from "./preconditions.js";
