import { OVERLAY_CLASS } from "./auto-layout-overlay-dom.js";

export const AUTO_LAYOUT_OVERLAY_CSS = /* css */ `
  .${OVERLAY_CLASS} {
    all: initial;
    position: fixed;
    top: 12px;
    left: 12px;
    width: 280px;
    max-height: 75vh;
    overflow-y: auto;
    box-sizing: border-box;
    pointer-events: auto;
    z-index: 2147483646;
    padding: 8px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 8px;
    background: oklch(18% 0.015 260);
    color: oklch(98% 0.005 260);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.3;
    box-shadow: 0 8px 24px oklch(0% 0 0 / 0.4);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .vc-auto-layout__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid oklch(28% 0.01 260);
    cursor: move;
    touch-action: none;
    user-select: none;
  }
  .vc-auto-layout__header--dragging { cursor: grabbing; }
  .vc-auto-layout__header > * { pointer-events: none; }
  .vc-auto-layout__title {
    font-weight: 600;
    color: oklch(85% 0.12 240);
  }
  .vc-auto-layout__role {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: oklch(28% 0.02 260);
    color: oklch(80% 0.05 260);
  }
  .vc-auto-layout__field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .vc-auto-layout__label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: oklch(65% 0.03 260);
  }
  .vc-auto-layout__control {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    align-items: center;
  }
  .vc-auto-layout__input,
  .vc-auto-layout__select {
    all: initial;
    min-width: 0;
    padding: 2px 4px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(14% 0.01 260);
    color: oklch(98% 0.005 260);
    font-family: inherit;
    font-size: 11px;
  }
  .vc-auto-layout__select { max-width: 140px; }
  .vc-auto-layout__input { width: 72px; }
  .vc-auto-layout__btn {
    all: initial;
    cursor: pointer;
    padding: 1px 6px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(28% 0.02 260);
    color: oklch(90% 0.08 240);
    font-family: inherit;
    font-size: 11px;
  }
  .vc-auto-layout__diagnostic {
    margin: 0;
    color: oklch(78% 0.08 70);
    font-size: 11px;
  }
  .vc-auto-layout-gap-handle {
    position: fixed;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: oklch(70% 0.18 240);
    border: 2px solid oklch(98% 0.005 260);
    box-shadow: 0 1px 4px oklch(0% 0 0 / 0.35);
    cursor: col-resize;
    z-index: 2147483645;
    pointer-events: auto;
  }
  .vc-auto-layout-gap-handle[data-axis="vertical"] {
    cursor: row-resize;
  }
`;
