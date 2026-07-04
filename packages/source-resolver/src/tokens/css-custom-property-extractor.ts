/**
 * CSS custom-property design-token extractor (VC-V1V2-18 / PRD 15.3).
 *
 * Extracts `--name: value;` declarations from `:root { ... }` blocks in a
 * workspace CSS file and shapes them as {@link DesignToken} records with
 * `css-custom-property` provenance. This is the "plain CSS custom properties"
 * source feeding the unified {@link TokenRegistry}: alongside Tailwind config
 * tokens and adapter hints it gives the agent cross-source token provenance.
 *
 * Design rules (load-bearing):
 * - Pure function: takes file CONTENT + a workspace-relative path, returns
 *   tokens. No `node:fs`, no globals, no framework imports (D15-clean).
 * - `:root` only: design tokens canonically live in `:root`. Custom properties
 *   scoped to arbitrary selectors are component-local, not design tokens, and
 *   are intentionally skipped (never silently mis-attributed).
 * - Category inference is a best-effort prefix map; an unrecognised prefix
 *   yields `unknown` rather than a guess. The registry accepts `unknown`.
 * - Malformed input defense: a CSS file with no `:root`, unclosed braces, or
 *   non-custom-property declarations yields an empty array — never a throw,
 *   never a fabricated token.
 */

import type { TokenCategory } from "./categories.js";
import { pxValue } from "./css-value.js";
import { createTokenProvenance } from "./provenance.js";
import { createDesignToken, type DesignToken } from "./registry.js";

/**
 * Infer a {@link TokenCategory} from a CSS custom-property name. Prefixes map
 * to the canonical categories; anything unrecognised becomes `unknown` (the
 * registry never drops data, but never guesses a wrong category either).
 */
const categoryForName = (name: string): TokenCategory => {
  // `--font-size-*` and `--font-weight-*` must be matched before `--font-*`.
  if (name.startsWith("--font-size")) return "fontSize";
  if (name.startsWith("--font-weight")) return "fontWeight";
  if (name.startsWith("--font")) return "fontFamily";
  if (name.startsWith("--text")) return "fontSize";
  if (name.startsWith("--color") || name.startsWith("--colour")) return "color";
  if (name.startsWith("--spacing") || name.startsWith("--space")) return "spacing";
  if (name.startsWith("--radius")) return "radius";
  if (name.startsWith("--shadow")) return "shadow";
  if (name.startsWith("--leading") || name.startsWith("--line-height")) return "lineHeight";
  if (name.startsWith("--z-index")) return "z-index";
  if (name.startsWith("--opacity")) return "opacity";
  if (name.startsWith("--border-width")) return "borderWidth";
  if (name.startsWith("--transition") || name.startsWith("--duration")) return "transition";
  return "unknown";
};

/** Matches a `:root` selector opening a declaration block. */
const ROOT_SELECTOR_RE = /:root\s*\{/g;
/** Matches one `--name: value;` declaration inside a block body. */
const DECLARATION_RE = /(--[\w-]+)\s*:\s*([^;}\n]+)/g;

/**
 * Extract design-token custom properties from a CSS file's `:root` blocks.
 *
 * Scans for every `:root { … }` block (non-nesting; the closing `}` ends the
 * scan window) and parses `--name: value;` declarations within each. Names
 * keep their leading `--` so they round-trip with `var(--name)` references.
 * The `sourcePath` provenance field is workspace-relative (never absolute).
 */
export const extractCssCustomProperties = (
  content: string,
  sourcePath: string,
): readonly DesignToken[] => {
  const out: DesignToken[] = [];
  const windows: string[] = [];
  ROOT_SELECTOR_RE.lastIndex = 0;
  let rootMatch: RegExpExecArray | null = ROOT_SELECTOR_RE.exec(content);
  while (rootMatch !== null) {
    const bodyStart = (rootMatch.index ?? 0) + rootMatch[0].length;
    // Capture up to the first `}` after the `:root {` opener. Nested braces in
    // a custom-property value are vanishingly rare and intentionally not
    // supported (over-extraction would mis-attribute non-token declarations).
    const closeIndex = content.indexOf("}", bodyStart);
    const body =
      closeIndex === -1 ? content.slice(bodyStart) : content.slice(bodyStart, closeIndex);
    windows.push(body);
    rootMatch = ROOT_SELECTOR_RE.exec(content);
  }

  for (const body of windows) {
    DECLARATION_RE.lastIndex = 0;
    let decl: RegExpExecArray | null = DECLARATION_RE.exec(body);
    while (decl !== null) {
      const name = decl[1];
      const rawValue = decl[2];
      if (name === undefined || rawValue === undefined) {
        decl = DECLARATION_RE.exec(body);
        continue;
      }
      const value = rawValue.trim();
      if (value.length === 0) {
        decl = DECLARATION_RE.exec(body);
        continue;
      }
      const category = categoryForName(name);
      const provenance = createTokenProvenance({ kind: "css-custom-property", sourcePath });
      const px = category === "spacing" ? pxValue(value) : undefined;
      out.push(
        px !== undefined
          ? createDesignToken({ name, category, value, px, provenance })
          : createDesignToken({ name, category, value, provenance }),
      );
      decl = DECLARATION_RE.exec(body);
    }
  }
  return out;
};
