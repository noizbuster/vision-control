/**
 * Tailwind v3 token registry (VC-V1V2-11).
 *
 * Loads spacing / color / typography tokens from a parsed Tailwind v3 config
 * object (the `tailwind.config.{js,ts,cjs,mjs}` `module.exports` / `export
 * default` value). The registry is a pure data structure built from a plain
 * object; it never `eval`s or dynamically imports the consumer's config file.
 * The daemon / workspace layer is responsible for resolving the config file
 * into the {@link TailwindConfigInput} shape this registry consumes, which
 * keeps this module deterministic and test-friendly.
 *
 * Default Tailwind v3 spacing scale is baked in so a minimal/empty config
 * still resolves standard utilities (`gap-2`, `p-4`, `mt-8`, ...). A
 * consumer-provided `theme.spacing` REPLACES the default scale (matching
 * Tailwind's own behavior — `spacing` is a top-level key, not `extend`).
 * `theme.extend.spacing` extends it.
 */
import { z } from "zod";

/** One resolved Tailwind token with its category and raw value. */
export interface TailwindToken {
  /** Scale key, e.g. `"2"`, `"red-500"`, `"lg"`. */
  readonly key: string;
  /** Coarse category driving suggestion logic and conflict grouping. */
  readonly category: TokenCategory;
  /** Raw theme value, e.g. `"0.5rem"`, `"#ef4444"`, `"1.125rem"`. */
  readonly value: string;
  /** Numeric pixel equivalent for spacing tokens (used for nearest-match). */
  readonly px?: number;
}

export type TokenCategory = "spacing" | "color" | "fontSize" | "fontFamily" | "unknown";

/**
 * Coarse input schema for a parsed Tailwind v3 config. Intentionally permissive
 * (`z.unknown()` records) because real-world configs carry plugin output and
 * nested theme objects we do not need to model fully; we extract only the keys
 * we use. Malformed input (missing theme, bad content paths) degrades to the
 * default scale rather than throwing.
 */
export const TailwindConfigInputSchema = z.object({
  content: z.array(z.unknown()).optional(),
  theme: z
    .object({
      extend: z.record(z.string(), z.unknown()).optional(),
      spacing: z.record(z.string(), z.unknown()).optional(),
      colors: z.record(z.string(), z.unknown()).optional(),
      fontSize: z.record(z.string(), z.unknown()).optional(),
      fontFamily: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export type TailwindConfigInput = z.infer<typeof TailwindConfigInputSchema>;

/**
 * Default Tailwind v3 spacing scale (key -> rem). `px` and `0` are special.
 * Source: Tailwind v3 `theme.spacing`.
 */
export const DEFAULT_TAILWIND_V3_SPACING: Readonly<Record<string, string>> = {
  px: "1px",
  0: "0px",
  "0.5": "0.125rem",
  "1": "0.25rem",
  "1.5": "0.375rem",
  "2": "0.5rem",
  "2.5": "0.625rem",
  "3": "0.75rem",
  "3.5": "0.875rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  7: "1.75rem",
  8: "2rem",
  9: "2.25rem",
  10: "2.5rem",
  11: "2.75rem",
  12: "3rem",
  14: "3.5rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
  28: "7rem",
  32: "8rem",
  36: "9rem",
  40: "10rem",
  44: "11rem",
  48: "12rem",
  52: "13rem",
  56: "14rem",
  60: "15rem",
  64: "16rem",
  72: "18rem",
  80: "20rem",
  96: "24rem",
};

/** Default Tailwind v3 color scale (a representative subset). */
export const DEFAULT_TAILWIND_V3_COLORS: Readonly<Record<string, string>> = {
  "red-50": "#fef2f2",
  "red-100": "#fee2e2",
  "red-500": "#ef4444",
  "red-900": "#7f1d1d",
  "blue-50": "#eff6ff",
  "blue-100": "#dbeafe",
  "blue-500": "#3b82f6",
  "blue-900": "#1e3a8a",
  "gray-50": "#f9fafb",
  "gray-100": "#f3f4f6",
  "gray-500": "#6b7280",
  "gray-900": "#111827",
  "green-500": "#22c55e",
  "yellow-500": "#eab308",
};

/** Default Tailwind v3 font sizes. */
export const DEFAULT_TAILWIND_V3_FONT_SIZE: Readonly<Record<string, string>> = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
};

/** Default Tailwind v3 font families. */
export const DEFAULT_TAILWIND_V3_FONT_FAMILY: Readonly<Record<string, string>> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, monospace",
};

const REM_TO_PX = 16;

const remToPx = (value: string): number | undefined => {
  const match = /^([0-9.]+)rem$/.exec(value);
  if (match === null) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n * REM_TO_PX : undefined;
};

/**
 * Pixel equivalent of a spacing CSS value. Supports `rem` (×16) and `px`.
 * Exported so the v4 `@theme` parser reuses the same conversion rather than
 * duplicating it. Returns `undefined` for non-numeric / other units.
 */
export const pxValue = (value: string): number | undefined => {
  const rem = remToPx(value);
  if (rem !== undefined) return rem;
  const match = /^([0-9.]+)px$/.exec(value);
  if (match === null) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
};

const recordFromUnknown = (input: unknown): Record<string, string> => {
  if (typeof input !== "object" || input === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
};

/**
 * Resolve a (possibly nested) color record into flat `"shade"` keys. Tailwind
 * colors may be either a string (`red-500`) or an object (`{ 50: ..., 500: ... }`).
 */
const flattenColors = (input: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (typeof input !== "object" || input === null) return out;
  for (const [name, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[name] = v;
    } else if (typeof v === "object" && v !== null) {
      for (const [shade, sv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof sv === "string") out[`${name}-${shade}`] = sv;
      }
    }
  }
  return out;
};

const buildToken = (key: string, category: TokenCategory, value: string): TailwindToken => {
  const px = category === "spacing" ? pxValue(value) : undefined;
  return px !== undefined ? { key, category, value, px } : { key, category, value };
};

/** Public registry surface: pure lookup + nearest-match + key listing. */
export interface TailwindTokenRegistry {
  /** Look up a token by its utility and scale key. Returns undefined when absent. */
  lookup(utility: string, value: string): TailwindToken | undefined;
  /**
   * Suggest the nearest spacing/fontSize token to `currentValue`. For spacing
   * utilities the match is by pixel distance; otherwise by key. Returns
   * `undefined` when no suggestion differs from the current token.
   */
  suggestNearest(utility: string, currentValue: string): TailwindToken | undefined;
  /** All registered scale keys for a category. */
  keysForCategory(category: TokenCategory): readonly string[];
  /** All tokens for a category (disambiguation-free, used by registry ingest). */
  tokensForCategory(category: TokenCategory): readonly TailwindToken[];
}

/**
 * Which utilities map to which token category. Drives `lookup` and conflict
 * grouping. Bare utilities (`flex`, `block`) have no value and no category.
 */
const UTILITY_CATEGORY: Readonly<Record<string, TokenCategory>> = {
  // spacing-driven
  gap: "spacing",
  "gap-x": "spacing",
  "gap-y": "spacing",
  p: "spacing",
  px: "spacing",
  py: "spacing",
  pt: "spacing",
  pr: "spacing",
  pb: "spacing",
  pl: "spacing",
  m: "spacing",
  mx: "spacing",
  my: "spacing",
  mt: "spacing",
  mr: "spacing",
  mb: "spacing",
  ml: "spacing",
  w: "spacing",
  h: "spacing",
  "min-w": "spacing",
  "min-h": "spacing",
  "max-w": "spacing",
  "max-h": "spacing",
  inset: "spacing",
  "inset-x": "spacing",
  "inset-y": "spacing",
  top: "spacing",
  right: "spacing",
  bottom: "spacing",
  left: "spacing",
  space: "spacing",
  "translate-x": "spacing",
  "translate-y": "spacing",
  // color-driven
  text: "color",
  bg: "color",
  border: "color",
  fill: "color",
  stroke: "color",
  ring: "color",
  shadow: "color",
  // typography
  font: "fontFamily",
  leading: "spacing",
  tracking: "spacing",
};

/**
 * `text-` is overloaded: `text-red-500` (color), `text-lg` (fontSize),
 * `text-center` (alignment, bare). `font-` is overloaded similarly. These
 * disambiguators pick the right category for a specific value key.
 */
const TEXT_SIZE_KEYS = new Set(Object.keys(DEFAULT_TAILWIND_V3_FONT_SIZE));

const categoryForTextValue = (value: string): TokenCategory => {
  if (TEXT_SIZE_KEYS.has(value)) return "fontSize";
  if (DEFAULT_TAILWIND_V3_COLORS[value] !== undefined) return "color";
  // A custom color key from config can still land here; default to color.
  return "color";
};

const isAlignmentTextValue = (value: string): boolean =>
  value === "left" || value === "center" || value === "right" || value === "justify";

const categoryForUtilityValue = (utility: string, value: string): TokenCategory | undefined => {
  if (utility === "text") {
    if (isAlignmentTextValue(value)) return undefined; // bare alignment utility
    return categoryForTextValue(value);
  }
  return UTILITY_CATEGORY[utility];
};

/**
 * Build a registry from a parsed config. Missing theme keys fall back to the
 * baked-in default scale. `theme.spacing` replaces the default; `theme.extend.*`
 * adds to it — matching Tailwind v3's own semantics.
 */
export const buildTokenRegistry = (config: TailwindConfigInput = {}): TailwindTokenRegistry => {
  const theme = config.theme ?? {};
  const extend = recordFromUnknown(theme.extend);

  // Spacing: default merged with extend, replaced if theme.spacing present.
  const spacingBase =
    theme.spacing !== undefined ? recordFromUnknown(theme.spacing) : DEFAULT_TAILWIND_V3_SPACING;
  const spacing = { ...spacingBase, ...recordFromUnknown(extend.spacing) };
  // Colors: default merged with extend + theme.colors.
  const colors = {
    ...DEFAULT_TAILWIND_V3_COLORS,
    ...flattenColors(theme.colors),
    ...flattenColors(extend.colors),
  };
  const fontSize = {
    ...DEFAULT_TAILWIND_V3_FONT_SIZE,
    ...recordFromUnknown(theme.fontSize),
    ...recordFromUnknown(extend.fontSize),
  };
  const fontFamily = {
    ...DEFAULT_TAILWIND_V3_FONT_FAMILY,
    ...recordFromUnknown(theme.fontFamily),
    ...recordFromUnknown(extend.fontFamily),
  };

  // Index tokens by (category, key) for O(1) lookup.
  const byCategory = new Map<TokenCategory, Map<string, TailwindToken>>();
  const ensure = (cat: TokenCategory): Map<string, TailwindToken> => {
    let m = byCategory.get(cat);
    if (m === undefined) {
      m = new Map();
      byCategory.set(cat, m);
    }
    return m;
  };
  for (const [k, v] of Object.entries(spacing))
    ensure("spacing").set(k, buildToken(k, "spacing", v));
  for (const [k, v] of Object.entries(colors)) ensure("color").set(k, buildToken(k, "color", v));
  for (const [k, v] of Object.entries(fontSize))
    ensure("fontSize").set(k, buildToken(k, "fontSize", v));
  for (const [k, v] of Object.entries(fontFamily))
    ensure("fontFamily").set(k, buildToken(k, "fontFamily", v));

  const lookup = (utility: string, value: string): TailwindToken | undefined => {
    const category = categoryForUtilityValue(utility, value);
    if (category === undefined) return undefined;
    return byCategory.get(category)?.get(value);
  };

  const suggestNearest = (utility: string, currentValue: string): TailwindToken | undefined => {
    const category = categoryForUtilityValue(utility, currentValue);
    if (category === undefined) return undefined;
    const bucket = byCategory.get(category);
    if (bucket === undefined) return undefined;
    const current = bucket.get(currentValue);
    if (category === "spacing") {
      const currentPx = current?.px;
      if (currentPx === undefined) return undefined;
      // Suggest the next size up (4px-grid "grow" convention): target ~2× the
      // current px and return the nearest token to that target (excluding the
      // current key), tie-breaking toward the larger token.
      const target = currentPx * 2;
      let best: TailwindToken | undefined;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const token of bucket.values()) {
        if (token.px === undefined || token.key === currentValue) continue;
        const delta = Math.abs(token.px - target);
        if (
          delta < bestDelta ||
          (delta === bestDelta && best !== undefined && (token.px ?? 0) > (best.px ?? 0))
        ) {
          bestDelta = delta;
          best = token;
        }
      }
      return best;
    }
    // Non-spacing: no numeric distance; return undefined (no deterministic suggestion).
    return undefined;
  };

  const keysForCategory = (category: TokenCategory): readonly string[] => [
    ...(byCategory.get(category)?.keys() ?? []),
  ];

  const tokensForCategory = (category: TokenCategory): readonly TailwindToken[] => [
    ...(byCategory.get(category)?.values() ?? []),
  ];

  return { lookup, suggestNearest, keysForCategory, tokensForCategory };
};

// --- Design-token registry ingest (VC-V1V2-18) -----------------------------

/**
 * Local structural mirror of the design-token registry port (VC-V1V2-18 / D15).
 *
 * This package does NOT import `@vision-control/source-resolver` (doing so would
 * recreate the cyclic workspace dependency documented in D15: source-resolver
 * re-exports TAILWIND_TOKEN_ADAPTER from here). TypeScript structural typing
 * makes any registry whose `register` accepts a compatible token shape
 * assignable to {@link TokenRegistrySink} — including
 * `InMemoryTokenRegistry` from source-resolver. The `category` and provenance
 * `kind` use narrow literal unions that are subsets of source-resolver's broader
 * unions, so `TailwindDesignTokenExport` is assignable to source-resolver's
 * `DesignToken`.
 */
export interface TailwindDesignTokenExport {
  readonly name: string;
  readonly category: TokenCategory;
  readonly value: string;
  readonly px?: number;
  readonly provenance: {
    readonly kind: "tailwind-v3-config";
    readonly sourcePath?: string;
  };
}

export interface TokenRegistrySink {
  register(token: TailwindDesignTokenExport): void;
}

/**
 * Register every Tailwind v3 token from a parsed config into a design-token
 * registry. Each token carries `tailwind-v3-config` provenance with the optional
 * config file path. Token names are the bare Tailwind scale keys (`"2"`,
 * `"red-500"`, `"lg"`, `"sans"`). Replaces (or supplements) the local
 * {@link TailwindTokenRegistry} when a unified cross-source registry is needed.
 */
export const registerTailwindTokens = (
  registry: TokenRegistrySink,
  config: TailwindConfigInput = {},
  options: { readonly configPath?: string } = {},
): void => {
  const built = buildTokenRegistry(config);
  const provenance: TailwindDesignTokenExport["provenance"] = {
    kind: "tailwind-v3-config",
    ...(options.configPath !== undefined ? { sourcePath: options.configPath } : {}),
  };
  const categories: Exclude<TokenCategory, "unknown">[] = [
    "spacing",
    "color",
    "fontSize",
    "fontFamily",
  ];
  for (const category of categories) {
    for (const token of built.tokensForCategory(category)) {
      const exportToken: TailwindDesignTokenExport =
        token.px !== undefined
          ? {
              name: token.key,
              category: token.category,
              value: token.value,
              px: token.px,
              provenance,
            }
          : { name: token.key, category: token.category, value: token.value, provenance };
      registry.register(exportToken);
    }
  }
};
