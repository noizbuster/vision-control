/**
 * @vision-control/svelte — Svelte dev-only source marker preprocessor and adapter
 * (V2 spike — VC-V1V2-19 / ADR-008).
 *
 * Platform: node (build-tool integration).
 */

export { createSvelteAdapter, SVELTE_ADAPTER, type SvelteAdapterData } from "./adapter.js";
export {
  detectSvelteUnsupported,
  injectSvelteMarkers,
  isSvelteProduction,
  registerMarkerEntries,
  SOURCE_MARKER_ATTRIBUTE,
  type SvelteMarkerDiagnostic,
  type SvelteMarkerOptions,
  type SvelteMarkerTransformParams,
  type SvelteMarkerTransformResult,
  visionControlSveltePreprocessor,
} from "./marker-plugin.js";
export { type MarkupElement, scanMarkupElements } from "./markup-scanner.js";
export type {
  AdapterContextLike,
  Confidence,
  ConfidenceEvidence,
  OwnershipRisk,
  SourceAdapterLike,
  SourceCandidate,
  SvelteRouteSegmentInfo,
} from "./types.js";

export const PACKAGE_NAME = "@vision-control/svelte";
