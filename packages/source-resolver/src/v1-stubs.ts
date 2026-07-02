/**
 * V1 feature stubs (PRD 7.2 scope boundary).
 *
 * Tailwind token-aware editing and CSS Modules mapping are explicitly V1
 * features. The MVP source resolver must NOT attempt resolution through these
 * adapters — doing so would return wrong results with false confidence. Instead
 * these stubs let the resolver produce a clear "unsupported" diagnostic so the
 * caller (context compiler / MCP server) can inform the agent that the feature
 * is out of scope.
 *
 * Each stub is a plain const object. When V1 lands, these are replaced by real
 * adapter implementations with no change to the resolver's call sites.
 */

export interface V1StubResult {
  readonly supported: false;
  readonly diagnostic: string;
}

/** Tailwind token-aware editing is a V1 feature (PRD 7.2). */
export const TAILWIND_TOKEN_STUB: V1StubResult = {
  supported: false,
  diagnostic: "Tailwind token-aware editing is a V1 feature",
} as const;

/** CSS Modules hashed-class-to-source mapping is a V1 feature (PRD 7.2). */
export const CSS_MODULES_STUB: V1StubResult = {
  supported: false,
  diagnostic: "CSS Modules mapping is a V1 feature",
} as const;

/** Check whether Tailwind token-aware resolution is available. */
export const checkTailwindTokenSupport = (): V1StubResult => TAILWIND_TOKEN_STUB;

/** Check whether CSS Modules mapping is available. */
export const checkCssModulesSupport = (): V1StubResult => CSS_MODULES_STUB;
