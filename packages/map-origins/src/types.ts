/**
 * Shared types for map-origin resolution.
 *
 * {@link MapOrigin} mirrors the portable snapshot field in
 * `@vision-control/context-compiler` without importing that package (map-origins
 * is a lower-level producer; the compiler consumes origins as pure data).
 */

/** Confidence that a map origin points at real source (never-wrong-HIGH later). */
export type OriginConfidence = "high" | "medium" | "low";

/** Kind of resource the origin was resolved from. */
export type OriginKind = "css" | "js" | "unknown";

/**
 * One map-derived origin candidate. Paths are URL or map-relative only — never
 * a required absolute machine path.
 */
export interface MapOrigin {
  /** Resource URL the origin was resolved from (stylesheet or script). */
  readonly sourceUrl?: string;
  /** Source-map URL when known. */
  readonly mapUrl?: string;
  /**
   * Path as reported by the map (`sources` entry), possibly after normalizing
   * webpack:// etc. Not a workspace-absolute filesystem path.
   */
  readonly relativePath?: string;
  readonly startLine?: number;
  readonly startColumn?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly snippet?: string;
  readonly confidence: OriginConfidence;
  readonly kind?: OriginKind;
  readonly warnings: readonly string[];
}

/**
 * Minimal fetch surface for content-script injection. Callers pass the page
 * `fetch` (or a test double). No global fetch is assumed.
 */
export type FetchLike = (
  input: string,
  init?: { readonly signal?: AbortSignal },
) => Promise<Response>;

/** One CSS rule to resolve against its stylesheet / source map. */
export interface CssRuleInput {
  /** CSS selector text (e.g. from `CSSStyleRule.selectorText`). */
  readonly selectorText: string;
  /** Stylesheet href (`CSSStyleSheet.href`); absent for inline sheets. */
  readonly stylesheetHref?: string;
  /**
   * Full stylesheet text used to discover `sourceMappingURL`. When omitted and
   * `stylesheetHref` is set, the pipeline fetches the stylesheet once.
   */
  readonly stylesheetText?: string;
  /** Pre-known map URL; skips `sourceMappingURL` discovery when set. */
  readonly mapUrl?: string;
}

/** Result of a CSS origin resolution pass. */
export interface ResolveCssOriginsResult {
  readonly origins: readonly MapOrigin[];
  /** True when C4 caps caused remaining maps to be skipped. */
  readonly originsTruncated: boolean;
}

/** Options for {@link resolveCssOrigins}. */
export interface ResolveCssOriginsOptions {
  /** Content-script (or test) fetch implementation. */
  readonly fetch: FetchLike;
  /** Epoch-ms clock (default `Date.now`). Injected for wall-clock tests. */
  readonly now?: () => number;
  /** Partial override of ADR-019 C4 caps (tests only in normal use). */
  readonly caps?: Partial<MapCaps>;
}

/** ADR-019 C4 map-fetch caps. */
export interface MapCaps {
  readonly maxMaps: number;
  readonly maxBytesPerMap: number;
  readonly maxBytesTotal: number;
  readonly fetchTimeoutMs: number;
  readonly wallClockMs: number;
}
