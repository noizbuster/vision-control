/**
 * Tailwind v4 `@theme` CSS-variable registry seam (VC-V1V2-11 / task 11).
 *
 * V1 (shipped). Tailwind v4 is CSS-first: theme tokens live in `@theme { … }`
 * at-rules in the consumer's CSS entry (`globals.css` / `app.css`), not in a
 * `tailwind.config.js`. {@link createTailwindV4ThemeRegistry} parses that CSS
 * with PostCSS (via {@link parseThemeTokens}) and exposes the resulting custom
 * properties as typed {@link TailwindToken}s through this interface.
 *
 * The registry is pure DATA: tokens carry their value and category only. It
 * does NOT emit confidence/evidence — never-wrong-HIGH is the resolver's job
 * (task 12 wires this registry into the adapter and adds the adversarial
 * "registry-only candidate stays MEDIUM" gate). A registry lookup is not HIGH
 * evidence on its own.
 *
 * {@link NOOP_V4_THEME_REGISTRY} is retained as the honest empty default for
 * callers (and tests) that have no v4 CSS to parse.
 */

import type { TailwindToken, TokenCategory } from "./tokens.js";
import { parseThemeTokens } from "./v4-theme-parser.js";

/**
 * Tailwind v4 CSS-variable-backed token registry. Resolves `@theme` custom
 * properties (e.g. `--spacing-2`, `--color-red-500`) into typed tokens.
 */
export interface TailwindV4ThemeRegistry {
  /**
   * Resolve a `@theme` CSS custom property name (with or without the leading
   * `--`, e.g. `"color-brand"` / `"--color-brand"`) or a bare token key
   * (`"brand"`) into a typed token. Full-name lookup wins; a bare key returns
   * the first (insertion-order) match when unambiguous. Returns `undefined`
   * when the name is unknown or the registry is empty.
   */
  resolveThemeVariable(name: string): TailwindToken | undefined;
  /** Every parsed `@theme` token, in first-registration order. */
  listThemeVariables(): readonly TailwindToken[];
}

/**
 * Inverse of the parser's namespace rule set: emitted category → the v4
 * namespace prefix used to reconstruct the full custom-property name for
 * full-name lookup. `unknown` is intentionally absent — the parser never
 * emits it, so its lookup resolves to `undefined` and the token is skipped.
 */
const CATEGORY_NAMESPACE: Readonly<Partial<Record<TokenCategory, string>>> = {
  color: "color",
  spacing: "spacing",
  fontFamily: "font",
  fontSize: "text",
};

/**
 * Build a v4 theme registry from a consumer's CSS. Parses every `@theme`
 * at-rule (via {@link parseThemeTokens}) and indexes tokens by both full
 * custom-property name (`"color-brand"`) and bare scale key (`"brand"`).
 * Malformed CSS or a CSS file with no `@theme` yields an empty registry — no
 * throw, no wrong token.
 */
export const createTailwindV4ThemeRegistry = (css: string): TailwindV4ThemeRegistry => {
  const tokens = parseThemeTokens(css);
  const byFullName = new Map<string, TailwindToken>();
  const byBareKey = new Map<string, TailwindToken[]>();
  for (const token of tokens) {
    const namespace = CATEGORY_NAMESPACE[token.category];
    if (namespace === undefined) continue;
    byFullName.set(`${namespace}-${token.key}`, token);
    const bucket = byBareKey.get(token.key);
    if (bucket === undefined) {
      byBareKey.set(token.key, [token]);
    } else {
      bucket.push(token);
    }
  }

  const resolveThemeVariable = (name: string): TailwindToken | undefined => {
    const normalized = name.startsWith("--") ? name.slice(2) : name;
    const full = byFullName.get(normalized);
    if (full !== undefined) return full;
    const bucket = byBareKey.get(normalized);
    return bucket !== undefined && bucket.length > 0 ? bucket[0] : undefined;
  };

  const listThemeVariables = (): readonly TailwindToken[] => tokens;

  return { resolveThemeVariable, listThemeVariables };
};

/**
 * Honest empty v4 registry. All lookups miss; the list is empty. Use this when
 * no v4 CSS is available (the V1 default surface before a workspace is
 * detected as v4). Never claims a token.
 */
export const NOOP_V4_THEME_REGISTRY: TailwindV4ThemeRegistry = {
  resolveThemeVariable: () => undefined,
  listThemeVariables: () => [],
};
