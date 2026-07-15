/**
 * @vision-control/map-origins — public API.
 *
 * CSS source-map origin resolution for the extension content script (ADR-019 C4).
 * Inject page `fetch`; no node:fs; missing maps → empty origins.
 */

export {
  acceptMapBytes,
  type CapBudget,
  canStartMapFetch,
  createCapBudget,
  DEFAULT_MAP_CAPS,
  MAP_CAPS,
  resolveCaps,
} from "./caps.js";
export { type FetchTextResult, fetchTextCapped } from "./fetch-text.js";
export { resolveCssOrigins } from "./resolve-css-origins.js";
export {
  CssSourceMap,
  parseSourceMap,
  type ResolvedRange,
  type SourceMapSegment,
} from "./source-map.js";
export { extractSourceMappingUrl, resolveMapUrl } from "./source-mapping-url.js";
export type {
  CssRuleInput,
  FetchLike,
  MapCaps,
  MapOrigin,
  OriginConfidence,
  OriginKind,
  ResolveCssOriginsOptions,
  ResolveCssOriginsResult,
} from "./types.js";
