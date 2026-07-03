/**
 * Parent/container outline (PRD §8.2).
 *
 * Draws a dotted outline around the selected element's containing/parent box
 * so the editor can show the reparent candidate. Visually distinct from the
 * hover (dashed) and selection (solid) outlines. Lives inside the overlay
 * shadow root; the element is advisory and never captures pointer events.
 */

import type { Rect } from "@vision-control/geometry";

export interface ParentOutline {
  readonly setParentOutline: (rect: Rect | null) => void;
  readonly clear: () => void;
}

const PARENT_CLASS = "vc-parent-outline";

export function createParentOutline(container: HTMLElement): ParentOutline {
  const document = container.ownerDocument;
  const element = document.createElement("div");
  element.className = PARENT_CLASS;
  element.style.display = "none";
  element.style.pointerEvents = "none";
  container.appendChild(element);

  const setParentOutline = (rect: Rect | null): void => {
    if (rect === null) {
      element.style.display = "none";
      return;
    }
    element.style.display = "block";
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  };

  const clear = (): void => {
    element.style.display = "none";
  };

  return { setParentOutline, clear };
}
