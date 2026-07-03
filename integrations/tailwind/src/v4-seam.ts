/**
 * Tailwind v4 `@theme` CSS-variable registry seam (VC-V1V2-11).
 *
 * V2 feature; do not claim v4 support in V1. This module documents the future
 * capability so V1 leaves a clean seam. The implementation is deliberately
 * empty: it resolves nothing and lists nothing. When Tailwind v4 ships as a
 * supported target (Wave 5+ / design-token registry task 18), a real
 * implementation will parse `@theme { --color-...: ...; }` blocks from the
 * consumer's CSS and expose the resulting CSS custom properties as
 * {@link TailwindToken}s through this same interface.
 *
 * Why a seam instead of a silent omission: keeping the interface here lets the
 * V1 token registry and adapter reference a single v4-capable surface without
 * a later breaking change. The adapter never reads from it in V1 (it queries
 * the v3 config-backed registry only), so an empty impl is honest — no v4
 * claim is made until a real implementation lands behind an ADR.
 */
import type { TailwindToken } from "./tokens.js";

/**
 * Future Tailwind v4 CSS-variable-backed token registry. Resolves `@theme`
 * custom properties (e.g. `--spacing-2`, `--color-red-500`) into typed tokens.
 */
export interface TailwindV4ThemeRegistry {
  /**
   * Resolve a `@theme` CSS custom property name (without the leading `--`) or
   * a Tailwind token key into a typed token. Returns `undefined` in V1.
   */
  resolveThemeVariable(name: string): TailwindToken | undefined;
  /** List every known `@theme` token. Returns an empty array in V1. */
  listThemeVariables(): readonly TailwindToken[];
}

/**
 * V1 no-op registry. All lookups miss; the list is empty. This is the only
 * implementation exported in V1 and is the documented "v4 is not supported"
 * surface — it never claims a token, so the adapter never relies on it.
 */
export const NOOP_V4_THEME_REGISTRY: TailwindV4ThemeRegistry = {
  resolveThemeVariable: () => undefined,
  listThemeVariables: () => [],
};
