/**
 * DevTools dark/light theme tokens for the visual-regression-lab (PRD §31.6).
 *
 * The overlay design system declares its tokens as CSS custom properties on the
 * shadow-root root container (see overlay-ui `styles.ts`). jsdom does not
 * resolve OKLCH or cascade custom properties through `getComputedStyle`, so to
 * make the active theme CAPTURABLE by the screenshot serializer every theme is
 * applied as INLINE custom properties on the root container. The dark set
 * mirrors the stylesheet defaults; the light set inverts the luminance ramp.
 *
 * The serializer reads every `--vc-*` inline property back, so a theme switch
 * shows up as a different screenshot byte stream and trips the diff threshold.
 */

/** The two DevTools palettes PRD §31.6 requires the lab to cover. */
export type DevToolsTheme = "dark" | "light";

export const DEVTOOLS_THEMES: readonly DevToolsTheme[] = ["dark", "light"] as const;

/** Human-readable label for diagnostic + evidence output. */
export const THEME_LABEL: Readonly<Record<DevToolsTheme, string>> = {
  dark: "DevTools dark (default)",
  light: "DevTools light",
};

/**
 * Inline token overrides per theme. Keys are the overlay design-system custom
 * properties; values are the resolved CSS strings the serializer captures.
 */
const THEME_TOKENS: Readonly<Record<DevToolsTheme, Readonly<Record<string, string>>>> = {
  dark: {
    "--vc-ink": "oklch(98% 0.005 260)",
    "--vc-surface": "oklch(18% 0.015 260)",
    "--vc-select": "oklch(65% 0.22 85)",
    "--vc-hover": "oklch(68% 0.2 240)",
    "--vc-handle": "oklch(60% 0.2 260)",
    "--vc-drop": "oklch(70% 0.18 300)",
    "--vc-drop-valid": "oklch(70% 0.22 145)",
    "--vc-drop-invalid": "oklch(60% 0.22 25)",
    "--vc-parent-outline": "oklch(72% 0.16 300)",
    "--vc-margin-fill": "oklch(80% 0.14 85)",
    "--vc-border-fill": "oklch(70% 0.16 250)",
    "--vc-padding-fill": "oklch(78% 0.16 145)",
    "--vc-axis-flex": "oklch(72% 0.22 200)",
    "--vc-axis-grid": "oklch(72% 0.2 300)",
    "--vc-changed-badge": "oklch(72% 0.22 60)",
    "--vc-drag-ghost": "oklch(60% 0.2 240)",
  },
  light: {
    "--vc-ink": "oklch(20% 0.02 260)",
    "--vc-surface": "oklch(98% 0.004 260)",
    "--vc-select": "oklch(55% 0.2 85)",
    "--vc-hover": "oklch(52% 0.18 240)",
    "--vc-handle": "oklch(45% 0.18 260)",
    "--vc-drop": "oklch(50% 0.18 300)",
    "--vc-drop-valid": "oklch(52% 0.2 145)",
    "--vc-drop-invalid": "oklch(55% 0.22 25)",
    "--vc-parent-outline": "oklch(48% 0.16 300)",
    "--vc-margin-fill": "oklch(85% 0.12 85)",
    "--vc-border-fill": "oklch(55% 0.16 250)",
    "--vc-padding-fill": "oklch(80% 0.14 145)",
    "--vc-axis-flex": "oklch(50% 0.2 200)",
    "--vc-axis-grid": "oklch(50% 0.18 300)",
    "--vc-changed-badge": "oklch(55% 0.2 60)",
    "--vc-drag-ghost": "oklch(48% 0.18 240)",
  },
};

/**
 * Apply a theme's tokens as inline custom properties on the overlay root
 * container. Idempotent: re-applying a theme replaces every prior token.
 */
export function applyTheme(rootContainer: HTMLElement, theme: DevToolsTheme): void {
  const tokens = THEME_TOKENS[theme];
  // Clear any previously-applied overlay token so switching themes is clean.
  for (let i = rootContainer.style.length - 1; i >= 0; i -= 1) {
    const name = rootContainer.style.item(i);
    if (name?.startsWith("--vc-")) {
      rootContainer.style.removeProperty(name);
    }
  }
  for (const [name, value] of Object.entries(tokens)) {
    rootContainer.style.setProperty(name, value);
  }
}
