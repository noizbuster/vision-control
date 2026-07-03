/**
 * @vision-control/vue — Vue dev-only source marker plugin and adapter
 * (V2 spike — VC-V1V2-19 / ADR-008).
 *
 * Provides:
 * - {@link visionControlVueMarkerPlugin} — a Vite plugin that injects opaque
 *   `data-vc-source` markers in DEV MODE ONLY. Production builds are untouched.
 * - {@link injectVueMarkers} — the pure marker-injection transform.
 * - {@link detectVueUnsupported} — unsupported-construct diagnostics.
 * - {@link VUE_ADAPTER} — the source resolver adapter (marker evidence, HIGH).
 * - {@link createVueAdapter} — factory for adapters with injected metadata.
 *
 * Platform: node (build-tool integration).
 */

export { createVueAdapter, VUE_ADAPTER, type VueAdapterData } from "./adapter.js";
export {
  detectVueUnsupported,
  injectVueMarkers,
  isVueProduction,
  registerMarkerEntries,
  SOURCE_MARKER_ATTRIBUTE,
  type VueMarkerDiagnostic,
  type VueMarkerOptions,
  type VueMarkerTransformParams,
  type VueMarkerTransformResult,
  visionControlVueMarkerPlugin,
} from "./marker-plugin.js";
export { scanTemplateElements, type TemplateElement } from "./template-scanner.js";
export type {
  AdapterContextLike,
  Confidence,
  ConfidenceEvidence,
  OwnershipRisk,
  SourceAdapterLike,
  SourceCandidate,
  VueRouteSegmentInfo,
  VueSfcBlock,
} from "./types.js";

export const PACKAGE_NAME = "@vision-control/vue";
