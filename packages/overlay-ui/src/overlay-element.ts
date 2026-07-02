/**
 * The main overlay element rendered inside the shadow root.
 *
 * Manages the lifecycle and positioning of hover outlines, selection outlines,
 * labels, confidence badges, drop indicators, and resize handles. All DOM
 * mutations are scoped to the shadow tree.
 */

import type { IdentityConfidence } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";

/** State for the currently selected element in the overlay. */
export interface SelectionOverlayState {
  readonly rect: Rect;
  readonly label: string;
  readonly confidence: IdentityConfidence;
}

/** API returned by {@link createOverlayElement}. */
export interface OverlayElement {
  /** Show or hide the hover outline for the given client rect. */
  readonly setHover: (rect: Rect | null) => void;
  /** Show or hide the selection outline, label, and confidence badge. */
  readonly setSelection: (state: SelectionOverlayState | null) => void;
  /** Show or hide the drop/insertion indicator. */
  readonly setDropIndicator: (rect: Rect | null) => void;
  /** Show or hide resize handles around the given rect. */
  readonly setResizeHandles: (rect: Rect | null) => void;
  /** Remove all rendered overlay artifacts. */
  readonly clear: () => void;
}

/**
 * Create the overlay content manager inside a shadow root.
 *
 * Assumes the shadow root already contains the stylesheet and root container
 * (see overlay-root.ts).
 */
export function createOverlayElement(shadowRoot: ShadowRoot): OverlayElement {
  const document = shadowRoot.ownerDocument;
  const root = getOrCreateRootContainer(shadowRoot);

  const hoverOutline = createDiv(document, "vc-outline vc-hover-outline");
  const selectOutline = createDiv(document, "vc-outline vc-select-outline");
  const label = createDiv(document, "vc-label");
  const badge = createDiv(document, "vc-badge");
  const dropIndicator = createDiv(document, "vc-drop-indicator");

  const handlesLayer = createDiv(document, "vc-handles-layer");
  const handles: HTMLElement[] = [];

  root.appendChild(hoverOutline);
  root.appendChild(selectOutline);
  root.appendChild(label);
  root.appendChild(dropIndicator);
  root.appendChild(handlesLayer);

  const setHover = (rect: Rect | null): void => {
    applyRect(hoverOutline, rect);
  };

  const setSelection = (state: SelectionOverlayState | null): void => {
    applyRect(selectOutline, state?.rect ?? null);
    if (state === null) {
      label.style.display = "none";
      return;
    }

    const { rect, label: labelText, confidence } = state;
    label.replaceChildren();
    const text = document.createElement("span");
    text.textContent = labelText;
    label.appendChild(text);

    badge.className = `vc-badge vc-badge-${confidence}`;
    badge.textContent = confidence;
    label.appendChild(badge);

    label.style.display = "inline-flex";
    label.style.left = `${rect.x}px`;
    label.style.top = `${Math.max(0, rect.y - 20)}px`;
  };

  const setDropIndicator = (rect: Rect | null): void => {
    applyRect(dropIndicator, rect);
  };

  const setResizeHandles = (rect: Rect | null): void => {
    handlesLayer.innerHTML = "";
    handles.length = 0;
    if (rect === null) {
      handlesLayer.style.display = "none";
      return;
    }

    const positions = ["nw", "ne", "sw", "se"] as const;
    for (const pos of positions) {
      const handle = createDiv(document, `vc-handle vc-handle-${pos}`);
      positionHandle(handle, rect, pos);
      handle.dataset.handlePosition = pos;
      handlesLayer.appendChild(handle);
      handles.push(handle);
    }
    handlesLayer.style.display = "block";
  };

  const clear = (): void => {
    setHover(null);
    setSelection(null);
    setDropIndicator(null);
    setResizeHandles(null);
  };

  return { setHover, setSelection, setDropIndicator, setResizeHandles, clear };
}

function getOrCreateRootContainer(shadowRoot: ShadowRoot): HTMLElement {
  const existing = shadowRoot.querySelector(".vc-overlay-root");
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const container = shadowRoot.ownerDocument.createElement("div");
  container.className = "vc-overlay-root";
  shadowRoot.appendChild(container);
  return container;
}

function createDiv(document: Document, className: string): HTMLElement {
  const div = document.createElement("div");
  div.className = className;
  div.style.display = "none";
  return div;
}

function applyRect(element: HTMLElement, rect: Rect | null): void {
  if (rect === null) {
    element.style.display = "none";
    return;
  }
  element.style.display = "block";
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function positionHandle(
  handle: HTMLElement,
  rect: Rect,
  position: "nw" | "ne" | "sw" | "se",
): void {
  const offset = -4;
  const left =
    position === "nw" || position === "sw" ? rect.x + offset : rect.x + rect.width + offset;
  const top =
    position === "nw" || position === "ne" ? rect.y + offset : rect.y + rect.height + offset;
  handle.style.left = `${left}px`;
  handle.style.top = `${top}px`;
  handle.style.display = "block";
}
