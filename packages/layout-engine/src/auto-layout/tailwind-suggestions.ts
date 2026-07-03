/**
 * Token suggestion port for Auto Layout (VC-V1V2-08 / PRD section 2287-2311).
 *
 * This module is isomorphic and deliberately does NOT import the Tailwind
 * integration (node-only) or the source-resolver registry. It defines a
 * {@link TokenSuggestionProvider} port that the browser layer bridges to the
 * real adapter registry. When a Tailwind (or CSS variable) adapter is
 * registered, the Auto Layout panel surfaces token candidates (e.g. `gap-4`)
 * alongside raw CSS.
 *
 * The static CSS→Tailwind utility mapping for Auto Layout properties lives here
 * because it is pure knowledge, not runtime data. Spacing value resolution
 * (which token is nearest to `1rem`) requires the registry and happens in the
 * provider.
 */

import type { ChildSizingCandidate, ContainerPropertyCandidate } from "./auto-layout-candidates.js";

/**
 * One token suggestion. A suggestion is advisory: the user or agent decides
 * whether to apply it instead of the raw CSS.
 */
export interface TokenSuggestion {
  /** The utility class, e.g. `"gap-4"`, `"flex-col"`, `"items-center"`. */
  readonly utility: string;
  /** Category hint: `"spacing"`, `"layout"`, `"alignment"`, `"flex"`. */
  readonly category: string;
  /** The raw CSS value the token maps to, for verification. E.g. `"1rem"`. */
  readonly rawValue?: string;
  /** Confidence 0-1; 1 = exact token match, lower = nearest-match suggestion. */
  readonly confidence: number;
}

/**
 * Provider port. The browser/daemon layer constructs a concrete provider by
 * wrapping a registered adapter (Tailwind token registry, CSS variable
 * registry). Structurally compatible with `SourceAdapter`-shaped resolvers.
 */
export interface TokenSuggestionProvider {
  /** Stable id, e.g. `"tailwind-token"`, `"css-variables"`. */
  readonly id: string;
  /**
   * Suggest token candidates for a CSS property/value pair. Returns an empty
   * array when the provider has nothing to say (not an error).
   */
  suggest(property: string, value: string): readonly TokenSuggestion[];
}

// ── Static CSS → Tailwind utility mapping ────────────────────────────────────

/**
 * Maps CSS alignment values to Tailwind utility suffixes. Used by the static
 * mapping below; these values have exact Tailwind equivalents (no token lookup
 * needed).
 */
const ALIGN_MAIN_MAP: Readonly<Record<string, string>> = {
  "flex-start": "justify-start",
  center: "justify-center",
  "flex-end": "justify-end",
  "space-between": "justify-between",
  "space-around": "justify-around",
  "space-evenly": "justify-evenly",
};

const ALIGN_CROSS_MAP: Readonly<Record<string, string>> = {
  "flex-start": "items-start",
  center: "items-center",
  "flex-end": "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const WRAP_MAP: Readonly<Record<string, string>> = {
  nowrap: "flex-nowrap",
  wrap: "flex-wrap",
  "wrap-reverse": "flex-wrap-reverse",
};

const DIRECTION_MAP: Readonly<Record<string, string>> = {
  row: "flex-row",
  "row-reverse": "flex-row-reverse",
  column: "flex-col",
  "column-reverse": "flex-col-reverse",
};

const WIDTH_KEYWORD_MAP: Readonly<Record<string, string>> = {
  "max-content": "w-max",
  "min-content": "w-min",
  "fit-content": "w-fit",
  "100%": "w-full",
};

const FLEX_SHORTHAND_MAP: Readonly<Record<string, string>> = {
  "0 0 auto": "flex-none",
  "1 1 0%": "flex-1",
  "0 0 200px": "basis-[200px]",
};

/**
 * Map an Auto Layout CSS property/value to a static Tailwind utility (exact
 * match, no token lookup). Returns `undefined` when the property/value pair is
 * value-driven (e.g. `gap: 1rem`) — those require the provider's token registry.
 *
 * This is the CSS→Tailwind knowledge for layout/alignment/flex properties.
 * Spacing tokens (`gap-4`, `p-4`) are resolved by the provider.
 */
export const mapCssToTailwindUtility = (property: string, value: string): string | undefined => {
  if (property === "flex-direction") return DIRECTION_MAP[value];
  if (property === "justify-content") return ALIGN_MAIN_MAP[value];
  if (property === "align-items") return ALIGN_CROSS_MAP[value];
  if (property === "flex-wrap") return WRAP_MAP[value];
  if (property === "flex") return FLEX_SHORTHAND_MAP[value];
  if (property === "width") return WIDTH_KEYWORD_MAP[value];
  if (property === "justify-self") {
    if (value === "start") return "justify-self-start";
    if (value === "stretch") return "justify-self-stretch";
    return undefined;
  }
  return undefined;
};

/** Whether a property is spacing-driven (needs token lookup for a Tailwind class). */
const isSpacingProperty = (property: string): boolean => {
  if (property === "gap" || property === "row-gap" || property === "column-gap") return true;
  if (property === "padding") return true;
  return property.startsWith("padding-");
};

/** Map a spacing CSS property to its Tailwind utility prefix + suffix hint. */
const spacingUtilityPrefix = (property: string): string => {
  if (property === "gap") return "gap";
  if (property === "row-gap") return "gap-y";
  if (property === "column-gap") return "gap-x";
  if (property === "padding") return "p";
  if (property === "padding-top") return "pt";
  if (property === "padding-right") return "pr";
  if (property === "padding-bottom") return "pb";
  if (property === "padding-left") return "pl";
  return "";
};

// ── Provider queries ─────────────────────────────────────────────────────────

/**
 * Suggest tokens for a single CSS property/value pair. Queries every provider;
 * if the pair has a static Tailwind utility, it is prepended at confidence 1.
 * Spacing values are delegated to the providers for token lookup.
 */
export const suggestTokens = (
  providers: readonly TokenSuggestionProvider[],
  property: string,
  value: string,
): readonly TokenSuggestion[] => {
  const out: TokenSuggestion[] = [];

  // Static utility mapping first (exact match, high confidence).
  const staticUtility = mapCssToTailwindUtility(property, value);
  if (staticUtility !== undefined) {
    out.push({
      utility: staticUtility,
      category: "layout",
      rawValue: value,
      confidence: 1,
    });
  }

  // Provider token lookups (spacing values, custom configs).
  for (const provider of providers) {
    const suggestions = provider.suggest(property, value);
    for (const s of suggestions) {
      out.push(s);
    }
  }

  return out;
};

/**
 * Suggest tokens for all declarations in a container-layout or child-sizing
 * candidate. Returns a flat list of suggestions keyed by the property they
 * correspond to.
 */
export interface CandidateTokenSuggestion {
  readonly property: string;
  readonly value: string;
  readonly suggestions: readonly TokenSuggestion[];
}

export const suggestForCandidate = (
  providers: readonly TokenSuggestionProvider[],
  candidate: ContainerPropertyCandidate | ChildSizingCandidate,
): readonly CandidateTokenSuggestion[] => {
  if (candidate.kind === "container-layout") {
    const suggestions = suggestTokens(providers, candidate.property, candidate.value);
    return [{ property: candidate.property, value: candidate.value, suggestions }];
  }
  // child-sizing: one suggestion set per declaration
  return candidate.declarations.map((decl) => ({
    property: decl.property,
    value: decl.value,
    suggestions: suggestTokens(providers, decl.property, decl.value),
  }));
};

/**
 * Combine multiple providers into a single composite provider. Suggestions are
 * collected in provider order. The composite id is `"composite"`.
 */
export const composeProviders = (
  ...providers: readonly TokenSuggestionProvider[]
): TokenSuggestionProvider => ({
  id: "composite",
  suggest: (property: string, value: string): readonly TokenSuggestion[] => {
    const out: TokenSuggestion[] = [];
    for (const p of providers) {
      const s = p.suggest(property, value);
      for (const item of s) out.push(item);
    }
    return out;
  },
});

// ── Built-in spacing provider factory ────────────────────────────────────────

/**
 * Factory for a basic spacing token provider. Given a scale (key → value map),
 * builds a provider that resolves spacing values to their nearest token. This
 * is the isomorphic fallback when a full Tailwind adapter is not registered;
 * the tailwind integration's real registry is structurally compatible and can
 * be used directly.
 */
export interface SpacingScale {
  readonly spacing: Readonly<Record<string, string>>;
}

const parsePx = (value: string): number | undefined => {
  const rem = /^([0-9.]+)rem$/.exec(value);
  if (rem !== null) {
    const n = Number(rem[1]);
    return Number.isFinite(n) ? n * 16 : undefined;
  }
  const px = /^([0-9.]+)px$/.exec(value);
  if (px !== null) {
    const n = Number(px[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

export const createSpacingTokenProvider = (
  scale: SpacingScale,
  id = "spacing",
): TokenSuggestionProvider => ({
  id,
  suggest: (property: string, value: string): readonly TokenSuggestion[] => {
    if (!isSpacingProperty(property)) return [];
    const prefix = spacingUtilityPrefix(property);
    if (prefix === "") return [];

    const targetPx = parsePx(value);
    if (targetPx === undefined) return [];

    // Exact match
    for (const [key, rawValue] of Object.entries(scale.spacing)) {
      if (parsePx(rawValue) === targetPx) {
        return [{ utility: `${prefix}-${key}`, category: "spacing", rawValue, confidence: 1 }];
      }
    }

    // Nearest match
    let bestKey: string | undefined;
    let bestValue: string | undefined;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const [key, rawValue] of Object.entries(scale.spacing)) {
      const px = parsePx(rawValue);
      if (px === undefined) continue;
      const delta = Math.abs(px - targetPx);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestKey = key;
        bestValue = rawValue;
      }
    }
    if (bestKey !== undefined && bestValue !== undefined) {
      const confidence = bestDelta === 0 ? 1 : Math.max(0.1, 1 - bestDelta / targetPx);
      return [
        { utility: `${prefix}-${bestKey}`, category: "spacing", rawValue: bestValue, confidence },
      ];
    }
    return [];
  },
});

/** Re-export for consumers that need the CSS utility mapping directly. */
export { isSpacingProperty };
