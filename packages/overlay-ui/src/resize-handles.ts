/**
 * Eight-position resize handle layer.
 *
 * Creates small squares at the corners and edge midpoints of a target rect.
 * Each handle has `pointer-events: auto` so it can capture drag starts. The
 * layer is designed to live inside the overlay shadow root and uses the
 * overlay design tokens declared in styles.ts.
 */

import type { Rect } from "@vision-control/geometry";

/** Compass positions for the eight resize handles. */
export const RESIZE_HANDLE_POSITIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

export type ResizeHandlePosition = (typeof RESIZE_HANDLE_POSITIONS)[number];

export interface ResizeHandles {
  /** Show the handles around `rect`. */
  readonly showResizeHandles: (rect: Rect) => void;
  /** Hide all handles. */
  readonly hideResizeHandles: () => void;
  /** Update the CSS cursor for one handle. */
  readonly updateHandleCursor: (handle: ResizeHandlePosition, cursor: string) => void;
  readonly setHandleDisabled: (handle: ResizeHandlePosition, disabled: boolean) => void;
  /** Read the DOM element for a handle, or null if not rendered. */
  readonly getHandleElement: (handle: ResizeHandlePosition) => HTMLElement | null;
  /** Remove the handle layer from the DOM. */
  readonly destroy: () => void;
}

interface HandleEntry {
  readonly position: ResizeHandlePosition;
  element: HTMLElement | null;
}

/** Create a resize handle layer inside `container`. */
export function createResizeHandles(container: HTMLElement): ResizeHandles {
  const document = container.ownerDocument;
  const layer = document.createElement("div");
  layer.className = "vc-handles-layer";

  const entries: Record<ResizeHandlePosition, HandleEntry> = {
    n: { position: "n", element: null },
    ne: { position: "ne", element: null },
    e: { position: "e", element: null },
    se: { position: "se", element: null },
    s: { position: "s", element: null },
    sw: { position: "sw", element: null },
    w: { position: "w", element: null },
    nw: { position: "nw", element: null },
  };

  container.appendChild(layer);

  const createHandle = (position: ResizeHandlePosition): HTMLButtonElement => {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.setAttribute("aria-label", `Resize ${position}`);
    handle.className = `vc-handle vc-handle-${position}`;
    handle.dataset.handlePosition = position;
    layer.appendChild(handle);
    return handle;
  };

  const positionHandle = (
    handle: HTMLElement,
    rect: Rect,
    position: ResizeHandlePosition,
  ): void => {
    const size = 8;
    const offset = -size / 2;

    let left: number;
    let top: number;

    switch (position) {
      case "nw":
        left = rect.x + offset;
        top = rect.y + offset;
        break;
      case "n":
        left = rect.x + rect.width / 2 + offset;
        top = rect.y + offset;
        break;
      case "ne":
        left = rect.x + rect.width + offset;
        top = rect.y + offset;
        break;
      case "e":
        left = rect.x + rect.width + offset;
        top = rect.y + rect.height / 2 + offset;
        break;
      case "se":
        left = rect.x + rect.width + offset;
        top = rect.y + rect.height + offset;
        break;
      case "s":
        left = rect.x + rect.width / 2 + offset;
        top = rect.y + rect.height + offset;
        break;
      case "sw":
        left = rect.x + offset;
        top = rect.y + rect.height + offset;
        break;
      case "w":
        left = rect.x + offset;
        top = rect.y + rect.height / 2 + offset;
        break;
      default: {
        const exhaustive: never = position;
        throw new Error(`unknown handle position: ${String(exhaustive)}`);
      }
    }

    handle.style.left = `${left}px`;
    handle.style.top = `${top}px`;
    handle.style.display = "block";
  };

  const showResizeHandles = (rect: Rect): void => {
    layer.innerHTML = "";
    for (const position of RESIZE_HANDLE_POSITIONS) {
      const handle = createHandle(position);
      positionHandle(handle, rect, position);
      entries[position].element = handle;
    }
    layer.style.display = "block";
  };

  const hideResizeHandles = (): void => {
    layer.innerHTML = "";
    for (const position of RESIZE_HANDLE_POSITIONS) {
      entries[position].element = null;
    }
    layer.style.display = "none";
  };

  const updateHandleCursor = (handle: ResizeHandlePosition, cursor: string): void => {
    const entry = entries[handle];
    if (entry.element !== null) {
      entry.element.style.cursor = cursor;
    }
  };

  const setHandleDisabled = (handle: ResizeHandlePosition, disabled: boolean): void => {
    const element = entries[handle].element;
    if (element instanceof HTMLButtonElement) {
      element.disabled = disabled;
    }
  };

  const getHandleElement = (handle: ResizeHandlePosition): HTMLElement | null => {
    return entries[handle].element;
  };

  const destroy = (): void => {
    layer.remove();
    for (const position of RESIZE_HANDLE_POSITIONS) {
      entries[position].element = null;
    }
  };

  return {
    showResizeHandles,
    hideResizeHandles,
    updateHandleCursor,
    setHandleDisabled,
    getHandleElement,
    destroy,
  };
}
