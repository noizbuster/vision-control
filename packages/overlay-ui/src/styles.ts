/**
 * Overlay design tokens and scoped CSS.
 *
 * All visual values are declared as CSS custom properties on the shadow root
 * container so the overlay has a single source of truth for color, spacing,
 * typography, and motion. No styles leak to the inspected page because the
 * stylesheet is injected inside the shadow root and the inner root resets all
 * inherited properties with `all: initial`.
 */

/** Class applied to the inner root container inside the shadow tree. */
export const OVERLAY_ROOT_CLASS = "vc-overlay-root";

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

  .vc-drop-indicator {
    position: absolute;
    pointer-events: none;
    background: var(--vc-drop);
    border-radius: var(--vc-radius-sm);
  }

  .vc-handles-layer {
    position: absolute;
    pointer-events: none;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .vc-handle {
    position: absolute;
    width: var(--vc-handle-size);
    height: var(--vc-handle-size);
    background: var(--vc-handle);
    border: 1px solid oklch(100% 0 0);
    border-radius: var(--vc-radius-sm);
    pointer-events: auto;
    cursor: pointer;
  }

  .vc-handle-n { cursor: n-resize; }
  .vc-handle-ne { cursor: ne-resize; }
  .vc-handle-e { cursor: e-resize; }
  .vc-handle-se { cursor: se-resize; }
  .vc-handle-s { cursor: s-resize; }
  .vc-handle-sw { cursor: sw-resize; }
  .vc-handle-se { cursor: se-resize; }

  .vc-drop-target-highlight {
    position: absolute;
    pointer-events: none;
    border: var(--vc-outline-width) solid var(--vc-drop-valid);
    border-radius: var(--vc-radius-sm);
    background: oklch(70% 0.22 145 / 0.08);
    transition: top var(--vc-transition-fast),
                left var(--vc-transition-fast),
                width var(--vc-transition-fast),
                height var(--vc-transition-fast);
  }

  .vc-drop-target-highlight--invalid {
    border-color: var(--vc-drop-invalid);
    background: oklch(60% 0.22 25 / 0.08);
  }

  .vc-drop-warning {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: var(--vc-space-2);
    padding: var(--vc-space-1) var(--vc-space-3);
    background: var(--vc-surface);
    color: var(--vc-drop-invalid);
    border-radius: var(--vc-radius-md);
    white-space: nowrap;
    user-select: none;
    pointer-events: none;
  }

  .vc-drop-warning__icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }
`;
