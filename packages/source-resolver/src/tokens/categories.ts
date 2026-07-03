/**
 * Design-token category taxonomy (VC-V1V2-18 / PRD 15.x, 16.x).
 *
 * The registry is framework-agnostic: Tailwind v3 config, Tailwind v4 `@theme`
 * CSS variables, plain CSS custom properties, CSS Modules `@value` exports, and
 * adapter hints all map into these same categories. The set is deliberately
 * coarse — fine-grained sub-categorisation is the consumer's job, not the
 * registry's. `unknown` is the escape hatch so a source that cannot classify a
 * token still registers it (the registry never silently drops data).
 */
import { z } from "zod";

/**
 * The canonical token categories. Kept as a const tuple so `z.enum` and the
 * TypeScript union stay in lock-step (the schema is derived from the tuple, not
 * declared independently — no drift possible).
 */
export const TOKEN_CATEGORIES = [
  "spacing",
  "color",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "lineHeight",
  "radius",
  "shadow",
  "z-index",
  "transition",
  "opacity",
  "borderWidth",
  "unknown",
] as const;

export type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

export const TokenCategorySchema = z.enum(TOKEN_CATEGORIES);

/**
 * Typography bundles the font-size / font-family / font-weight / line-height
 * categories. Used by the summary exporter to group related tokens together.
 */
const TYPOGRAPHY_CATEGORIES: ReadonlySet<TokenCategory> = new Set([
  "fontSize",
  "fontFamily",
  "fontWeight",
  "lineHeight",
]);

export const isTypographyCategory = (category: TokenCategory): boolean =>
  TYPOGRAPHY_CATEGORIES.has(category);
