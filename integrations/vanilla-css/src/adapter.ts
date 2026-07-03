/**
 * Vanilla CSS source adapter (PRD §15.3 / Task 45).
 *
 * Maps an element's runtime CSS classes to the plain-CSS rules that style them,
 * surfacing the PRD §15.3 metadata: matched selector, stylesheet URL, cascade
 * layer, specificity, media query, source range, and CSS custom-property origin.
 *
 * The adapter is a {@link SourceAdapterLike} implementation. It is constructed
 * via {@link createVanillaCssAdapter} with parsed stylesheets and optional
 * source maps. The exported {@link VANILLA_CSS_ADAPTER} singleton has no data
 * loaded and returns no candidates (it defers to other cascades when used
 * bare).
 *
 * **Confidence policy** (never-wrong-HIGH):
 * - Author stylesheet text parsed to a selector range → **HIGH**
 *   (evidence: `ast-origin`; AST analysis pins the location).
 * - Processed-CSS source map resolves a range → **HIGH**
 *   (evidence: `source-map` + range).
 * - Stylesheet URL known but no range → **MEDIUM** at best.
 *
 * The resolver runs `enforceNeverWrongHigh` on every candidate regardless, so
 * an adapter that claims HIGH without a qualifying range is downgraded.
 */

import { produceCandidates, type VanillaCssAdapterData } from "./source-candidates.js";
import type { AdapterContextLike, SourceAdapterLike, SourceCandidate } from "./types.js";

/**
 * Factory: create a vanilla CSS source adapter with parsed stylesheets and
 * optional source maps. Callers that have loaded workspace stylesheets should
 * use this instead of the bare {@link VANILLA_CSS_ADAPTER} singleton.
 */
export const createVanillaCssAdapter = (data: VanillaCssAdapterData = {}): SourceAdapterLike => ({
  id: "vanilla-css",
  description:
    "Vanilla CSS/SCSS matched-selector resolution (stylesheet URL, cascade layer, specificity, media query, source range, custom-property origin)",
  resolve: (context: AdapterContextLike): readonly SourceCandidate[] => {
    const classes = context.cssClasses;
    if (classes === undefined || classes.length === 0) return [];
    return produceCandidates(classes, data);
  },
});

/**
 * Default singleton adapter — no stylesheets loaded.
 *
 * Returns no candidates (defers to the resolver's built-in CSS-token cascade
 * and other adapters when used bare). Wire {@link createVanillaCssAdapter} with
 * parsed workspace stylesheets for HIGH-resolution behavior.
 */
export const VANILLA_CSS_ADAPTER: SourceAdapterLike = createVanillaCssAdapter();
