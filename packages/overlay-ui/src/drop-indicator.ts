import type { Rect } from "@vision-control/geometry";

/** Orientation of the drop-indicator line. */
export type DropIndicatorOrientation = "horizontal" | "vertical";

/**
 * API returned by {@link createDropIndicator}. The function names match the
 * task contract: show, hide, and update a single insertion line rendered
 * inside the overlay container.
 */
export interface DropIndicatorApi {
  readonly showDropIndicator: (rect: Rect, orientation: DropIndicatorOrientation) => void;
  readonly hideDropIndicator: () => void;
  readonly updateDropIndicator: (rect: Rect) => void;
}

const INDICATOR_CLASS = "vc-drop-indicator";

function applyRect(element: HTMLElement, rect: Rect): void {
  element.style.display = "block";
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

/**
 * Create a drop indicator bound to an overlay container.
 *
 * The indicator element is appended to `container` and styled with the overlay
 * design-system class `vc-drop-indicator`. It is absolutely positioned and
 * receives its geometry from the caller, which typically derives it from the
 * layout engine's `InsertionIndicator`.
 */
export function createDropIndicator(container: HTMLElement): DropIndicatorApi {
  const document = container.ownerDocument;
  const element = document.createElement("div");
  element.className = INDICATOR_CLASS;
  element.style.display = "none";
  element.style.position = "absolute";
  element.style.pointerEvents = "none";
  container.appendChild(element);

  let lastOrientation: DropIndicatorOrientation = "horizontal";

  const showDropIndicator = (rect: Rect, orientation: DropIndicatorOrientation): void => {
    lastOrientation = orientation;
    element.setAttribute("data-orientation", orientation);
    applyRect(element, rect);
  };

  const hideDropIndicator = (): void => {
    element.style.display = "none";
  };

  const updateDropIndicator = (rect: Rect): void => {
    applyRect(element, rect);
    element.setAttribute("data-orientation", lastOrientation);
  };

  return { showDropIndicator, hideDropIndicator, updateDropIndicator };
}
