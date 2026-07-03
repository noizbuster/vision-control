/**
 * @vision-control/next-react — Next.js dev-only source marker plugin and adapter
 * (V1 — VC-V1V2-13 / ADR-008).
 *
 * Provides:
 * - {@link withVisionControlSourceMarkers} — a Next.js config wrapper that
 *   injects opaque `data-vc-source` markers in DEV MODE ONLY. Production builds
 *   are untouched (ADR-008 hard guardrail).
 * - {@link injectNextMarkers} — the pure marker-injection transform.
 * - {@link NEXT_ADAPTER} — the source resolver adapter (marker evidence, HIGH).
 * - {@link createNextAdapter} — factory for adapters with injected metadata.
 * - {@link detectTurbopack} — Turbopack detection (V2+ experimental; V1 =
 *   webpack/Babel only).
 * - {@link assertHydrationSafe} — hydration-safety verification utilities.
 *
 * Platform: node (build-tool integration).
 */

export { createNextAdapter, NEXT_ADAPTER, type NextAdapterData } from "./adapter.js";
export {
  assertHydrationSafe,
  extractMarkers,
  type HydrationCheckInput,
  type HydrationCheckResult,
  isMarkerDeterministic,
} from "./hydration-safety.js";
export { default as markerLoader, type MarkerLoaderOptions } from "./loader.js";
export {
  detectBoundaries,
  detectRouteSegment,
  injectNextMarkers,
  isNextProduction,
  type NextConfig,
  type NextMarkerTransformParams,
  type NextMarkerTransformResult,
  type NextSourceMarkerOptions,
  registerMarkerEntries,
  SOURCE_MARKER_ATTRIBUTE,
  withVisionControlSourceMarkers,
} from "./plugin.js";
export {
  detectTurbopack,
  type TurbopackDiagnostic,
  turbopackWarning,
} from "./turbopack-diagnostic.js";
export type {
  AdapterContextLike,
  Confidence,
  ConfidenceEvidence,
  OwnershipRisk,
  RouteSegmentInfo,
  ServerClientBoundary,
  SourceAdapterLike,
  SourceCandidate,
} from "./types.js";

export const PACKAGE_NAME = "@vision-control/next-react";
