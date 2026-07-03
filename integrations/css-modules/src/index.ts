/**
 * @vision-control/css-modules — CSS Modules hashed-class-to-source mapping.
 *
 * Maps a runtime hashed CSS Modules class (e.g. `_button_ab12cd`) back to its
 * source origin using a bundler-generated manifest and CSS source maps.
 * Supports css-loader (webpack/Next.js) and Vite output formats, composition
 * tracing, and a conservative hash-name heuristic fallback.
 *
 * Platform: node (build-tool integration).
 */

export {
  CSS_MODULES_ADAPTER,
  type CssModulesAdapterData,
  createCssModulesAdapter,
} from "./adapter.js";
export {
  type ComposedCandidate,
  traceComposition,
} from "./composition.js";
export {
  detectHashHeuristic,
  type HashHeuristicResult,
  type HashPattern,
} from "./hash-heuristic.js";
export {
  CssModulesManifest,
  type ManifestEntry,
  type ManifestFormat,
  parseManifest,
  parseManifestJson,
} from "./manifest.js";
export { type CandidateProducerData, produceCandidates } from "./source-candidates.js";
export {
  CssSourceMap,
  parseSourceMap,
  type ResolvedRange,
  type SourceMapSegment,
} from "./source-map.js";

export const PACKAGE_NAME = "@vision-control/css-modules";
