/**
 * Overlay design tokens and scoped CSS.
 *
 * All visual values are declared as CSS custom properties on the shadow root
 * container so the overlay has a single source of truth for color, spacing,
 * typography, and motion. No styles leak to the inspected page because the
 * stylesheet is injected inside the shadow root and the inner root resets all
 * inherited properties with `all: initial`.
 */

import { INTERACTION_STYLES } from "./interaction-styles.js";

/** Class applied to the inner root container inside the shadow tree. */
export const OVERLAY_ROOT_CLASS = "vc-overlay-root";

// allow: SIZE_OK — single cohesive shadow-root stylesheet (design tokens + CSS
// rules must ship as one template literal so the overlay injects one <style>).
// Pure declarative data, no logic; splitting would fragment the design system.

/** All overlay CSS, designed to be injected into a shadow root `<style>`. */
export const OVERLAY_CSS = /* css */ `
  .${OVERLAY_ROOT_CLASS} {
    all: initial;
    position: absolute;
    inset: 0;
    pointer-events: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.3;
    color: var(--vc-ink);

    /* Color tokens (OKLCH, high-contrast devtool palette) */
    --vc-ink: oklch(98% 0.005 260);
    --vc-surface: oklch(18% 0.015 260);
    --vc-hover: oklch(68% 0.2 240);
    --vc-select: oklch(65% 0.22 85);
    --vc-handle: oklch(60% 0.2 260);
    --vc-drop: oklch(70% 0.18 300);
    --vc-drop-valid: oklch(70% 0.22 145);
    --vc-drop-invalid: oklch(60% 0.22 25);

    /* Confidence badge tokens */
    --vc-confidence-high: oklch(70% 0.22 145);
    --vc-confidence-medium: oklch(75% 0.18 95);
    --vc-confidence-low: oklch(70% 0.01 260);

    /* Spacing / sizing tokens */
    --vc-outline-width: 2px;
    --vc-handle-size: 8px;
    --vc-radius-sm: 2px;
    --vc-radius-md: 4px;
    --vc-space-1: 2px;
    --vc-space-2: 4px;
    --vc-space-3: 6px;

    /* Motion tokens */
    --vc-transition-fast: 120ms ease-out;

    /* Snap guide tokens (PRD §9.8) — per-kind guide colors. */
    --vc-snap-edge: oklch(75% 0.18 95);
    --vc-snap-center: oklch(70% 0.2 260);
    --vc-snap-baseline: oklch(70% 0.22 25);
    --vc-snap-grid: oklch(70% 0.01 260);
    --vc-snap-spacing-token: oklch(70% 0.22 300);

    /* PRD §8.2 artifact tokens.
       Box-model regions follow the Chromium DevTools convention:
       margin = amber, border = blue, padding = green. */
    --vc-parent-outline: oklch(72% 0.16 300);
    --vc-margin-fill: oklch(80% 0.14 85);
    --vc-margin-edge: oklch(70% 0.16 85);
    --vc-border-fill: oklch(70% 0.16 250);
    --vc-padding-fill: oklch(78% 0.16 145);
    --vc-padding-edge: oklch(68% 0.18 145);
    --vc-axis-flex: oklch(72% 0.22 200);
    --vc-axis-grid: oklch(72% 0.2 300);
    --vc-rotation-handle: oklch(55% 0.01 260);
    --vc-rotation-handle-stroke: oklch(45% 0.01 260);
    --vc-changed-badge: oklch(72% 0.22 60);
    --vc-changed-badge-ink: oklch(15% 0.02 60);
    --vc-drag-ghost: oklch(60% 0.2 240);
    --vc-drag-placeholder: oklch(70% 0.18 240);

    /* Rotation handle is intentionally non-interactive (PRD §8.2). */
    --vc-handle-disabled-opacity: 0.5;
  }

  .${OVERLAY_ROOT_CLASS} *,
  .${OVERLAY_ROOT_CLASS} *::before,
  .${OVERLAY_ROOT_CLASS} *::after {
    box-sizing: border-box;
  }

  .vc-layer {
    position: absolute;
    pointer-events: none;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .vc-outline {
    position: absolute;
    pointer-events: none;
    will-change: transform, width, height;
  }

  .vc-hover-outline {
    border: var(--vc-outline-width) dashed var(--vc-hover);
    border-radius: var(--vc-radius-sm);
  }

  .vc-select-outline {
    border: var(--vc-outline-width) solid var(--vc-select);
    border-radius: var(--vc-radius-sm);
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--vc-select) 30%, transparent),
      0 4px 12px oklch(0% 0 0 / 0.25);
    transition: top var(--vc-transition-fast),
                left var(--vc-transition-fast),
                width var(--vc-transition-fast),
                height var(--vc-transition-fast);
  }

  .vc-label {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: var(--vc-space-2);
    padding: var(--vc-space-1) var(--vc-space-3);
    background: var(--vc-surface);
    color: var(--vc-ink);
    border-radius: var(--vc-radius-md);
    white-space: nowrap;
    user-select: none;
    pointer-events: none;
  }

  .vc-badge {
    display: inline-block;
    padding: var(--vc-space-1) var(--vc-space-2);
    border-radius: var(--vc-radius-sm);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: oklch(15% 0.01 260);
  }

  .vc-badge-high { background: var(--vc-confidence-high); }
  .vc-badge-medium { background: var(--vc-confidence-medium); }
  .vc-badge-low { background: var(--vc-confidence-low); color: var(--vc-ink); }

  /* PRD §8.2 — parent/container outline (distinct from hover/select). */
  .vc-parent-outline {
    position: absolute;
    pointer-events: none;
    border: var(--vc-outline-width) dotted var(--vc-parent-outline);
    border-radius: var(--vc-radius-md);
    will-change: transform, width, height;
  }

  /* PRD §8.2 — margin/border/padding visualization (DevTools box-model overlay). */
  .vc-box-model {
    position: absolute;
    pointer-events: none;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .vc-box-model__region {
    position: absolute;
    pointer-events: none;
    box-sizing: border-box;
    background: transparent;
    border-style: solid;
  }

  .vc-box-model__region--margin {
    border-color: color-mix(in oklch, var(--vc-margin-fill) 48%, transparent);
    outline: 1px dashed var(--vc-margin-edge);
    outline-offset: -1px;
  }

  .vc-box-model__region--border {
    border-color: color-mix(in oklch, var(--vc-border-fill) 46%, transparent);
  }

  .vc-box-model__region--padding {
    border-color: color-mix(in oklch, var(--vc-padding-fill) 52%, transparent);
    outline: 1px dashed var(--vc-padding-edge);
    outline-offset: -1px;
  }

  /* PRD §8.2 — flex/grid main-axis indicator. */
  .vc-axis-indicator {
    position: absolute;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .vc-axis-indicator__line {
    position: absolute;
    pointer-events: none;
    background: var(--vc-axis-flex);
    box-shadow: 0 0 0 1px oklch(0% 0 0 / 0.25);
  }

  .vc-axis-indicator--grid .vc-axis-indicator__line {
    background: var(--vc-axis-grid);
  }

  .vc-axis-indicator__arrow {
    position: absolute;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  /* PRD §8.2 — rotation handle, intentionally non-interactive. */
  .vc-rotation-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--vc-rotation-handle);
    border: 1px solid var(--vc-rotation-handle-stroke);
    opacity: var(--vc-handle-disabled-opacity);
    pointer-events: none;
  }

  .vc-rotation-handle__stem {
    position: absolute;
    width: 1px;
    background: var(--vc-rotation-handle-stroke);
    pointer-events: none;
  }

  /* PRD §8.2 — changed-element badge (변경된 요소 badge). */
  .vc-changed-badge {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: var(--vc-space-1);
    padding: var(--vc-space-1) var(--vc-space-2);
    background: var(--vc-changed-badge);
    color: var(--vc-changed-badge-ink);
    border-radius: var(--vc-radius-sm);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    user-select: none;
    pointer-events: none;
  }

  ${INTERACTION_STYLES}
`;
