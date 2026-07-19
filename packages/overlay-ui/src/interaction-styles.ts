export const INTERACTION_STYLES = `
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
    padding: 0;
    border: 1px solid var(--vc-ink);
    border-radius: var(--vc-radius-sm);
    background: var(--vc-handle);
    pointer-events: auto;
    cursor: pointer;
  }

  .vc-handle:disabled {
    background: color-mix(in oklch, var(--vc-drop-invalid) 55%, var(--vc-surface));
    cursor: not-allowed;
    opacity: var(--vc-handle-disabled-opacity);
  }

  .vc-handle-n { cursor: n-resize; }
  .vc-handle-ne { cursor: ne-resize; }
  .vc-handle-e { cursor: e-resize; }
  .vc-handle-se { cursor: se-resize; }
  .vc-handle-s { cursor: s-resize; }
  .vc-handle-sw { cursor: sw-resize; }

  .vc-drop-target-highlight {
    position: absolute;
    pointer-events: none;
    border: var(--vc-outline-width) solid var(--vc-drop-valid);
    border-radius: var(--vc-radius-sm);
    background: color-mix(in oklch, var(--vc-drop-valid) 8%, transparent);
  }

  .vc-drop-target-highlight--invalid {
    border-color: var(--vc-drop-invalid);
    background: color-mix(in oklch, var(--vc-drop-invalid) 8%, transparent);
  }

  .vc-drop-warning,
  .vc-flex-pair-label {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: var(--vc-space-2);
    padding: var(--vc-space-1) var(--vc-space-3);
    border-radius: var(--vc-radius-md);
    background: var(--vc-surface);
    user-select: none;
    pointer-events: none;
  }

  .vc-drop-warning {
    color: var(--vc-drop-invalid);
    white-space: nowrap;
  }

  .vc-drop-warning__icon {
    width: calc(var(--vc-space-3) * 2);
    height: calc(var(--vc-space-3) * 2);
    flex-shrink: 0;
  }

  .vc-flex-pair-label {
    color: var(--vc-ink);
    max-width: calc(100vw - var(--vc-space-2));
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .vc-flex-pair-label--disabled-edge,
  .vc-flex-pair-label--blocked {
    color: var(--vc-drop-invalid);
  }

  .vc-flex-pair-outline {
    position: absolute;
    pointer-events: none;
    border: var(--vc-outline-width) solid var(--vc-drop-valid);
    border-radius: var(--vc-radius-sm);
  }

  .vc-flex-pair-outline--active {
    border-color: var(--vc-handle);
  }

  .vc-flex-pair-outline--disabled-edge,
  .vc-flex-pair-outline--blocked {
    border-color: var(--vc-drop-invalid);
    border-style: dashed;
    outline: var(--vc-outline-width) dashed var(--vc-drop-invalid);
    outline-offset: var(--vc-outline-width);
  }

  .vc-snap-guide-layer {
    position: absolute;
    pointer-events: none;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .vc-snap-guide {
    position: absolute;
    pointer-events: none;
    box-shadow: 0 0 0 1px oklch(0% 0 0 / 0.3);
  }

  .vc-snap-guide--edge { background: var(--vc-snap-edge); }
  .vc-snap-guide--center { background: var(--vc-snap-center); }
  .vc-snap-guide--baseline { background: var(--vc-snap-baseline); }
  .vc-snap-guide--grid { background: var(--vc-snap-grid); }
  .vc-snap-guide--spacing-token { background: var(--vc-snap-spacing-token); }

  .vc-drag-ghost {
    position: absolute;
    pointer-events: none;
    background: color-mix(in oklch, var(--vc-drag-ghost) 25%, transparent);
    border: 1px solid var(--vc-drag-ghost);
    border-radius: var(--vc-radius-sm);
    box-shadow: 0 var(--vc-space-2) calc(var(--vc-space-3) * 2) oklch(0% 0 0 / 0.2);
  }

  .vc-drag-placeholder {
    position: absolute;
    pointer-events: none;
    border: var(--vc-outline-width) dashed var(--vc-drag-placeholder);
    border-radius: var(--vc-radius-sm);
    background: color-mix(in oklch, var(--vc-drag-placeholder) 12%, transparent);
  }

  .vc-marquee-rect {
    position: absolute;
    pointer-events: none;
    border: 1px dashed var(--vc-select);
    background: color-mix(in oklch, var(--vc-select) 10%, transparent);
    border-radius: var(--vc-radius-sm);
  }
`;
