/**
 * Design-token registry public surface (VC-V1V2-18).
 *
 * Re-exports the category taxonomy, source provenance, the registry contract +
 * in-memory implementation, conflict detection, and runtime CSS-variable
 * resolution. Framework-agnostic and in-process only.
 */

export {
  isTypographyCategory,
  TOKEN_CATEGORIES,
  type TokenCategory,
  TokenCategorySchema,
} from "./categories.js";
export {
  detectTokenConflicts,
  formatConflictWarning,
  TOKEN_CONFLICT_WARNING_CODE,
  type TokenConflict,
} from "./conflict-detection.js";
export { extractCssCustomProperties } from "./css-custom-property-extractor.js";
export {
  createTokenProvenance,
  TOKEN_SOURCE_KINDS,
  type TokenProvenance,
  TokenProvenanceSchema,
  type TokenSourceKind,
  TokenSourceKindSchema,
} from "./provenance.js";
export {
  createDesignToken,
  type DesignToken,
  DesignTokenSchema,
  InMemoryTokenRegistry,
  type ResolvedToken,
  type TokenRegistry,
  type TokenRegistrySummary,
} from "./registry.js";
export {
  extractVariableName,
  type RuntimeCssVariableResolution,
  resolveAllVarReferences,
  resolveRuntimeCssVariable,
  UNRESOLVED_TOKEN_WARNING_CODE,
} from "./runtime-css-variables.js";
