/**
 * Tailwind v4 `@theme` CSS-variable parser (VC-V1V2-11 / task 11).
 *
 * Walks `@theme { --*: ...; }` at-rules in a consumer's CSS entry
 * (`globals.css` / `app.css`) using PostCSS (PRD §22 stack choice — do NOT
 * hand-roll a CSS tokenizer), reads the custom-property declarations, and maps
 * Tailwind v4 namespaces to {@link TokenCategory}.
 *
 * Output is pure DATA: typed {@link TailwindToken}s with their category and
 * raw value. The parser NEVER carries confidence/evidence — never-wrong-HIGH
 * is the resolver's job (task 12 adds the adversarial "registry-only candidate
 * stays MEDIUM" gate). A token emitted here is not HIGH evidence on its own.
 *
 * Scope: only the four namespaces the narrow Tailwind `TokenCategory` models
 * are emitted (`--color-*`, `--spacing-*`, `--font-*`, `--text-*`). Every other
 * v4 namespace (`--radius-*`, `--shadow-*`, `--font-weight-*`, ...) is skipped
 * rather than guessed into `unknown` — those tokens reach the unified registry
 * via plain CSS custom-property extraction instead. Only EXPLICIT declarations
 * are parsed; v4's dynamic spacing scale (`--spacing` base multiplier) is not
 * synthesised here (that resolution lives in the adapter, task 12).
 */
import postcss, { type AtRule, type Declaration, type Root } from "postcss";

import { pxValue, type TailwindToken, type TokenCategory } from "./tokens.js";

/**
 * Namespace → category rules, ordered longest-prefix-first so e.g.
 * `font-weight` is matched (and skipped, `null`) before `font` would
 * mis-attribute `--font-weight-bold` to fontFamily. `null` marks a recognised
 * v4 namespace that the narrow {@link TokenCategory} does not model — it is
 * skipped deliberately (never guessed).
 */
export const THEME_NAMESPACE_RULES: readonly (readonly [
  namespace: string,
  category: Exclude<TokenCategory, "unknown"> | null,
])[] = [
  ["font-weight", null],
  ["color", "color"],
  ["spacing", "spacing"],
  ["text", "fontSize"],
  ["font", "fontFamily"],
];

const matchNamespace = (
  fullName: string,
): { readonly key: string; readonly category: TokenCategory } | undefined => {
  for (const [ns, cat] of THEME_NAMESPACE_RULES) {
    if (fullName === ns || fullName.startsWith(`${ns}-`)) {
      if (cat === null) return undefined;
      const key = fullName.slice(ns.length + 1);
      return key === "" ? undefined : { key, category: cat };
    }
  }
  return undefined;
};

const buildToken = (key: string, category: TokenCategory, value: string): TailwindToken => {
  const px = category === "spacing" ? pxValue(value) : undefined;
  return px !== undefined ? { key, category, value, px } : { key, category, value };
};

/**
 * Parse every `@theme` at-rule in `css` into typed tokens. Pure: no I/O, no
 * side effects, no throws. Malformed CSS or a missing `@theme` degrades to an
 * empty array (the honest "no v4 tokens" result, never a crash, never a wrong
 * token). Tokens are deduped by full custom-property name across multiple
 * `@theme` blocks; first registration wins (deterministic, matching the
 * source-resolver registry semantics).
 */
export const parseThemeTokens = (css: string): readonly TailwindToken[] => {
  let root: Root;
  try {
    root = postcss.parse(css);
  } catch {
    return [];
  }

  const tokens: TailwindToken[] = [];
  const seen = new Set<string>();
  root.walkAtRules("theme", (atRule: AtRule) => {
    const nodes = atRule.nodes;
    if (nodes === undefined) return;
    for (const node of nodes) {
      if (node.type !== "decl") continue;
      const decl = node as Declaration;
      const prop = decl.prop;
      if (!prop.startsWith("--")) continue;
      const value = decl.value.trim();
      if (value === "") continue;
      const fullName = prop.slice(2);
      const matched = matchNamespace(fullName);
      if (matched === undefined) continue;
      if (seen.has(fullName)) continue;
      seen.add(fullName);
      tokens.push(buildToken(matched.key, matched.category, value));
    }
  });
  return tokens;
};
