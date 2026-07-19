/**
 * The main overlay element rendered inside the shadow root.
 *
 * Manages the lifecycle and positioning of hover outlines, selection outlines,
 * labels, confidence badges, drop indicators, and resize handles. All DOM
 * mutations are scoped to the shadow tree.
 */

import type { IdentityConfidence } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";

import { type BoxModelState, createBoxModelOverlay } from "./box-model-overlay.js";
import { type ChangedBadgeState, createChangedBadge } from "./changed-badge.js";
import { createDragGhost, type DragGhostState } from "./drag-ghost.js";
import { createFlexGridAxis, type FlexGridAxisState } from "./flex-grid-axis.js";
import { createFlexPairFeedback, type FlexPairFeedbackState } from "./flex-pair-feedback.js";
import { createParentOutline } from "./parent-outline.js";
import type { ResizeHandlePosition } from "./resize-handles.js";
import { createResizeHandles } from "./resize-handles.js";
import { createRotationHandle } from "./rotation-handle.js";

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
  /** Read a resize handle element by position, or null if not shown. */
  readonly getResizeHandle: (position: ResizeHandlePosition) => HTMLElement | null;
  /** Update the cursor style of one resize handle. */
  readonly updateResizeHandleCursor: (position: ResizeHandlePosition, cursor: string) => void;
  readonly setFlexPairFeedback: (state: FlexPairFeedbackState | null) => void;
  /** Show or hide the parent/container outline (PRD §8.2). */
  readonly setParentOutline: (rect: Rect | null) => void;
  /** Show or hide the margin/border/padding visualization (PRD §8.2). */
  readonly setBoxModel: (state: BoxModelState | null) => void;
  /** Show or hide the flex/grid main-axis indicator (PRD §8.2). */
  readonly setFlexGridAxis: (state: FlexGridAxisState | null) => void;
  /** Show the rotation handle around `rect` (PRD §8.2 — always disabled). */
  readonly setRotationHandle: (rect: Rect | null) => void;
  /** Show or hide the changed-element badge (PRD §8.2). */
  readonly setChangedBadge: (state: ChangedBadgeState | null) => void;
  /** Show or hide the drag ghost/placeholder (PRD §8.2). */
  readonly setDragGhost: (state: DragGhostState | null) => void;
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
  const resizeHandles = createResizeHandles(root);
  const flexPairFeedback = createFlexPairFeedback(root, resizeHandles);
  const parentOutline = createParentOutline(root);
  const boxModel = createBoxModelOverlay(root);
  const flexGridAxis = createFlexGridAxis(root);
  const rotationHandle = createRotationHandle(root);
  const changedBadge = createChangedBadge(root);
  const dragGhost = createDragGhost(root);

  root.appendChild(hoverOutline);
  root.appendChild(selectOutline);
  root.appendChild(label);
  root.appendChild(dropIndicator);

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
    if (rect === null) {
      resizeHandles.hideResizeHandles();
      return;
    }
    resizeHandles.showResizeHandles(rect);
  };

  const getResizeHandle = (position: ResizeHandlePosition): HTMLElement | null => {
    return resizeHandles.getHandleElement(position);
  };

  const updateResizeHandleCursor = (position: ResizeHandlePosition, cursor: string): void => {
    resizeHandles.updateHandleCursor(position, cursor);
  };

  const setFlexPairFeedback = (state: FlexPairFeedbackState | null): void => {
    if (state === null) {
      flexPairFeedback.clear();
      return;
    }
    flexPairFeedback.set(state);
  };

  const setParentOutline = (rect: Rect | null): void => {
    parentOutline.setParentOutline(rect);
  };

  const setBoxModel = (state: BoxModelState | null): void => {
    boxModel.setBoxModel(state);
  };

  const setFlexGridAxis = (state: FlexGridAxisState | null): void => {
    flexGridAxis.setAxis(state);
  };

  const setRotationHandle = (rect: Rect | null): void => {
    if (rect === null) {
      rotationHandle.clear();
      return;
    }
    rotationHandle.show(rect);
  };

  const setChangedBadge = (state: ChangedBadgeState | null): void => {
    if (state === null) {
      changedBadge.clear();
      return;
    }
    changedBadge.showChangedBadge(state);
  };

  const setDragGhost = (state: DragGhostState | null): void => {
    if (state === null) {
      dragGhost.clear();
      return;
    }
    dragGhost.showDragGhost(state);
  };

  const clear = (): void => {
    setHover(null);
    setSelection(null);
    setDropIndicator(null);
    setResizeHandles(null);
    setFlexPairFeedback(null);
    setParentOutline(null);
    setBoxModel(null);
    setFlexGridAxis(null);
    setRotationHandle(null);
    setChangedBadge(null);
    setDragGhost(null);
  };

  return {
    setHover,
    setSelection,
    setDropIndicator,
    setResizeHandles,
    getResizeHandle,
    updateResizeHandleCursor,
    setFlexPairFeedback,
    setParentOutline,
    setBoxModel,
    setFlexGridAxis,
    setRotationHandle,
    setChangedBadge,
    setDragGhost,
    clear,
  };
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
