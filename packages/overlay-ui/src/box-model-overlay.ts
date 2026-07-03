/**
 * Margin/border/padding visualization (PRD §8.2).
 *
 * Renders the classic DevTools box-model overlay: nested translucent regions
 * for margin, border, and padding around the content rect. Each region is sized
 * from its edge widths. All markup lives in the overlay shadow root.
 */

import type { Rect } from "@vision-control/geometry";

/** Per-edge widths (px) for one box-model region. */
export interface EdgeValues {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** State driving the box-model overlay. `rect` is the border-box. */
export interface BoxModelState {
  readonly rect: Rect;
  readonly margin: EdgeValues;
  readonly border: EdgeValues;
  readonly padding: EdgeValues;
}

export interface BoxModelOverlay {
  readonly setBoxModel: (state: BoxModelState | null) => void;
  readonly clear: () => void;
}

export function createBoxModelOverlay(container: HTMLElement): BoxModelOverlay {
  const document = container.ownerDocument;
  const layer = document.createElement("div");
  layer.className = "vc-box-model";
  layer.style.display = "none";
  layer.style.pointerEvents = "none";
  container.appendChild(layer);

  const marginRegion = document.createElement("div");
  marginRegion.className = "vc-box-model__region vc-box-model__region--margin";
  marginRegion.style.pointerEvents = "none";
  const borderRegion = document.createElement("div");
  borderRegion.className = "vc-box-model__region vc-box-model__region--border";
  borderRegion.style.pointerEvents = "none";
  const paddingRegion = document.createElement("div");
  paddingRegion.className = "vc-box-model__region vc-box-model__region--padding";
  paddingRegion.style.pointerEvents = "none";

  layer.appendChild(marginRegion);
  layer.appendChild(borderRegion);
  layer.appendChild(paddingRegion);

  const applyRegion = (el: HTMLElement, region: Rect): void => {
    el.style.left = `${region.x}px`;
    el.style.top = `${region.y}px`;
    el.style.width = `${region.width}px`;
    el.style.height = `${region.height}px`;
    el.style.display = "block";
  };

  const setBoxModel = (state: BoxModelState | null): void => {
    if (state === null) {
      layer.style.display = "none";
      marginRegion.style.display = "none";
      borderRegion.style.display = "none";
      paddingRegion.style.display = "none";
      return;
    }

    const { rect, margin, border } = state;
    layer.style.display = "block";

    applyRegion(marginRegion, {
      x: rect.x - margin.left,
      y: rect.y - margin.top,
      width: margin.left + rect.width + margin.right,
      height: margin.top + rect.height + margin.bottom,
    });

    applyRegion(borderRegion, rect);

    applyRegion(paddingRegion, {
      x: rect.x + border.left,
      y: rect.y + border.top,
      width: Math.max(0, rect.width - border.left - border.right),
      height: Math.max(0, rect.height - border.top - border.bottom),
    });
  };

  const clear = (): void => setBoxModel(null);

  return { setBoxModel, clear };
}
