/**
 * @vision-control/vanilla-css — Vanilla CSS/SCSS source adapter (PRD §15.3).
 *
 * Maps an element's runtime CSS classes to the plain-CSS rules that style them.
 * Surfaces the matched selector, stylesheet URL, cascade layer, specificity,
 * media query, source range (via AST parse of author CSS or a CSS source map
 * for processed output), and CSS custom-property origin.
 *
 * Platform: node (build-tool integration). Does NOT depend on
 * @vision-control/source-resolver (D15 local-mirror contract) — the adapter
 * contract types are mirrored locally in types.ts.
 */

export { createVanillaCssAdapter, VANILLA_CSS_ADAPTER } from "./adapter.js";
export {
  produceCandidates,
  type VanillaCssAdapterData,
} from "./source-candidates.js";
export {
  countSegments,
  parseSourceMap,
  type SourceMapSegment,
  VanillaCssSourceMap,
} from "./source-map.js";
export { computeSpecificity } from "./specificity.js";
export {
  type ParsedCustomProperty,
  type ParsedRule,
  type ParsedStyleSheet,
  parseStyleSheet,
} from "./stylesheet.js";
export type {
  AdapterContextLike,
  Confidence,
  ConfidenceEvidence,
  CustomPropertyOrigin,
  OwnershipRisk,
  SourceAdapterLike,
  SourceCandidate,
  VanillaCssSourceRange,
} from "./types.js";

export const PACKAGE_NAME = "@vision-control/vanilla-css";
