/**
 * CSS-in-JS + pseudo-element editing public surface (VC-V1V2-20).
 *
 * - Static-extractable CSS-in-JS (styled-components/emotion/stitches) resolves
 *   HIGH with `ast-origin`; dynamic runtime-generated styles are agent-required.
 * - Pseudo-element/pseudo-state editing (`::before`, `::after`, `:hover`,
 *   `:focus`, ...) with source-origin resolution and an additive operation
 *   schema carrying a `pseudoClass` field.
 *
 * Re-exported through source-resolver's public barrel. The
 * {@link CSS_IN_JS_ADAPTER} singleton is the canonical registration surfaced via
 * `v1-stubs.ts`; callers with a definition registry use
 * {@link createCssInJsAdapter}.
 */

export {
  CSS_IN_JS_ADAPTER,
  type CssInJsAdapterData,
  type CssInJsHeuristicResult,
  createCssInJsAdapter,
  detectCssInJsHeuristic,
} from "./adapter.js";
export {
  buildPseudoElementEdit,
  PSEUDO_ELEMENTS,
  PSEUDO_STATES,
  type PseudoElementEdit,
  PseudoElementEditSchema,
  type PseudoElementKind,
  type PseudoElementRule,
  type PseudoStateKind,
  type PseudoTargetKind,
  PseudoTargetKindSchema,
  pseudoPreviewSelector,
  resolvePseudoElementOrigin,
} from "./pseudo-elements.js";
export {
  type CssInJsDefinition,
  type CssInJsFlavor,
  type DynamicReason,
  type ExtractedDeclaration,
  extractStaticStyles,
  type StaticStyleExtraction,
  type StyleDefinitionShape,
} from "./static-extraction.js";
