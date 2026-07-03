/**
 * Marquee drag-rectangle overlay (PRD §9.1).
 *
 * Renders a selection rectangle inside the overlay shadow root while the user
 * drags. The rectangle is drawn from a start point to the current pointer
 * position, normalized so x/y is always the top-left corner. All elements are
 * `pointer-events: none` so the drag never steals the pointer from the page.
 */

import type { Point, Rect } from "@vision-control/geometry";

const MARQUEE_CLASS = "vc-marquee-rect";

/**
 * API returned by {@link createMarqueeOverlay}. The caller drives the lifecycle:
 * `showMarquee` on pointer-down, `updateMarquee` on pointer-move, `hideMarquee`
 * on pointer-up, and `getRect` at any point to feed the hit-testing layer.
 */
export interface MarqueeOverlay {
  readonly showMarquee: (startPoint: Point) => void;
  readonly updateMarquee: (currentPoint: Point) => void;
  readonly hideMarquee: () => void;
  readonly getRect: () => Rect | null;
}

/**
 * Create a marquee overlay layer inside `shadowRoot`. The layer owns a single
 * `vc-marquee-rect` div positioned absolutely. Re-using an existing layer (for
 * repeated drags) avoids leaking DOM nodes across marquee sessions.
 */
export function createMarqueeOverlay(shadowRoot: ShadowRoot): MarqueeOverlay {
  const document = shadowRoot.ownerDocument;
  const root = getOrCreateMarqueeLayer(shadowRoot);

  const element = document.createElement("div");
  element.className = MARQUEE_CLASS;
  element.style.display = "none";
  element.style.position = "absolute";
  element.style.pointerEvents = "none";
  root.appendChild(element);

  let start: Point | null = null;
  let current: Point | null = null;

  const computeRect = (): Rect | null => {
    if (start === null || current === null) return null;
    return normalizeRect(start, current);
  };

  const render = (rect: Rect): void => {
    element.style.display = "block";
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  };

  const showMarquee = (startPoint: Point): void => {
    start = startPoint;
    current = startPoint;
    render({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });
  };

  const updateMarquee = (currentPoint: Point): void => {
    current = currentPoint;
    const rect = computeRect();
    if (rect !== null) render(rect);
  };

  const hideMarquee = (): void => {
    start = null;
    current = null;
    element.style.display = "none";
  };

  const getRect = (): Rect | null => computeRect();

  return { showMarquee, updateMarquee, hideMarquee, getRect };
}

/** Normalize two corner points into a non-negative `{ x, y, width, height }`. */
function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function getOrCreateMarqueeLayer(shadowRoot: ShadowRoot): HTMLElement {
  const existing = shadowRoot.querySelector(".vc-marquee-layer");
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const layer = shadowRoot.ownerDocument.createElement("div");
  layer.className = "vc-marquee-layer vc-overlay-root";
  shadowRoot.appendChild(layer);
  return layer;
}
