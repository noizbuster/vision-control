/**
 * Snap guide overlay layer (PRD §8.2 "snapping guides" + §9.8).
 *
 * Renders one guide line per active snap candidate inside the overlay container
 * (which lives in the shadow root, so no style leaks into the inspected page).
 * Each line is `pointer-events: none` — the guides are advisory visuals only;
 * the interaction controller decides whether to apply a snap.
 */

import type { Rect } from "@vision-control/geometry";
import type { SnapCandidate } from "@vision-control/layout-engine";

/** Bounds the guide lines should span (typically the parent or viewport rect). */
export interface SnapGuideBounds {
  readonly bounds: Rect;
}

export interface SnapGuides {
  /** Render one guide line per candidate, sized to `bounds`. Empty list hides the layer. */
  readonly setSnapGuides: (candidates: readonly SnapCandidate[], bounds: SnapGuideBounds) => void;
  /** Remove all guide lines and hide the layer. */
  readonly clear: () => void;
}

const GUIDE_CLASS = "vc-snap-guide";

/**
 * Create a snap-guide layer bound to an overlay container. The container is
 * expected to live inside the overlay shadow root (see overlay-root.ts), so the
 * rendered elements inherit the overlay design-system tokens and never touch the
 * inspected page's CSS.
 */
export function createSnapGuides(container: HTMLElement): SnapGuides {
  const document = container.ownerDocument;
  const layer = document.createElement("div");
  layer.className = "vc-snap-guide-layer";
  layer.style.display = "none";
  container.appendChild(layer);

  const renderLine = (candidate: SnapCandidate, bounds: Rect): HTMLElement => {
    const line = document.createElement("div");
    line.className = `${GUIDE_CLASS} ${GUIDE_CLASS}--${candidate.axis} ${GUIDE_CLASS}--${candidate.kind}`;
    line.style.pointerEvents = "none";
    line.setAttribute("data-snap-axis", candidate.axis);
    line.setAttribute("data-snap-kind", candidate.kind);
    if (candidate.token !== undefined) {
      line.setAttribute("data-snap-token", candidate.token);
    }

    if (candidate.axis === "x") {
      // Vertical line at x = value, spanning the bounds' height.
      line.style.left = `${candidate.value}px`;
      line.style.top = `${bounds.y}px`;
      line.style.width = "1px";
      line.style.height = `${bounds.height}px`;
    } else {
      // Horizontal line at y = value, spanning the bounds' width.
      line.style.left = `${bounds.x}px`;
      line.style.top = `${candidate.value}px`;
      line.style.width = `${bounds.width}px`;
      line.style.height = "1px";
    }
    return line;
  };

  const setSnapGuides = (candidates: readonly SnapCandidate[], context: SnapGuideBounds): void => {
    layer.replaceChildren();
    for (const candidate of candidates) {
      layer.appendChild(renderLine(candidate, context.bounds));
    }
    layer.style.display = candidates.length > 0 ? "block" : "none";
  };

  const clear = (): void => {
    layer.replaceChildren();
    layer.style.display = "none";
  };

  return { setSnapGuides, clear };
}
