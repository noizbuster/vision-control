/**
 * Codemod module barrel (VC-V1V2-23 / ADR-014).
 *
 * Optional direct codemod as an explicit local CLI action, OUTSIDE MCP. Consumes
 * deterministic patch suggestions (Task 14/21 generator output), shows the diff
 * + preconditions, requires explicit `--confirm`, writes through the normal
 * file-writing path, and always runs source-after-HMR verification.
 *
 * The MCP tool list stays source-write-free. There is no apply/codemod MCP tool
 * and there will not be one (ADR-010 / ADR-014).
 */

export {
  type ApplyOptions,
  type ApplyResult,
  applySuggestion,
  type VerificationResult,
} from "./apply-suggestion.js";
export {
  type CodemodLoadResult,
  loadSuggestion,
  runCodemodApply,
  runCodemodPreview,
} from "./commands.js";
export {
  type DiffPreview,
  type DiffPreviewLine,
  type DiffPreviewLineKind,
  formatDiffPreview,
  renderDiffPreview,
} from "./diff-preview.js";
