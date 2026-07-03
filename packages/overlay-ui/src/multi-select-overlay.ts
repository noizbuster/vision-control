/**
 * Multi-select overlay layer.
 *
 * Renders N member outlines (one per selected element) plus a single group
 * bounding outline with eight resize handles. Browser-only: it creates DOM
 * elements inside the overlay shadow root and positions them from the pure
 * `MultiSelectGroup` model + per-member rects supplied by the caller.
 */

import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { Rect } from "@vision-control/geometry";

import { createResizeHandles, type ResizeHandles } from "./resize-handles.js";

export interface MultiSelectOverlay {
  readonly setGroup: (group: MultiSelectGroup | null, memberRects: readonly Rect[]) => void;
  readonly clear: () => void;
}

/**
 * Create a multi-select overlay layer inside `shadowRoot`. The layer owns a
 * member-outline container, a group bounding outline, and a resize-handle layer
 * reused from the single-select overlay.
 */
export function createMultiSelectOverlay(shadowRoot: ShadowRoot): MultiSelectOverlay {
  const document = shadowRoot.ownerDocument;
  const root = getOrCreateMultiLayer(shadowRoot);

  const memberLayer = document.createElement("div");
  memberLayer.className = "vc-multi-member-layer";
  root.appendChild(memberLayer);

  const groupOutline = document.createElement("div");
  groupOutline.className = "vc-multi-group-outline";
  groupOutline.style.display = "none";
  root.appendChild(groupOutline);

  const handles: ResizeHandles = createResizeHandles(root);

  const clearMemberOutlines = (): void => {
    memberLayer.replaceChildren();
  };

  const renderMembers = (memberRects: readonly Rect[]): void => {
    clearMemberOutlines();
    for (const rect of memberRects) {
      const outline = document.createElement("div");
      outline.className = "vc-outline vc-multi-member-outline";
      outline.style.position = "absolute";
      outline.style.left = `${rect.x}px`;
      outline.style.top = `${rect.y}px`;
      outline.style.width = `${rect.width}px`;
      outline.style.height = `${rect.height}px`;
      memberLayer.appendChild(outline);
    }
  };

  const setGroup = (group: MultiSelectGroup | null, memberRects: readonly Rect[]): void => {
    if (group === null) {
      clearMemberOutlines();
      groupOutline.style.display = "none";
      handles.hideResizeHandles();
      return;
    }
    renderMembers(memberRects);
    const { x, y, width, height } = group.boundingRect;
    groupOutline.style.display = "block";
    groupOutline.style.left = `${x}px`;
    groupOutline.style.top = `${y}px`;
    groupOutline.style.width = `${width}px`;
    groupOutline.style.height = `${height}px`;
    handles.showResizeHandles(group.boundingRect);
  };

  const clear = (): void => {
    clearMemberOutlines();
    groupOutline.style.display = "none";
    handles.hideResizeHandles();
  };

  return { setGroup, clear };
}

function getOrCreateMultiLayer(shadowRoot: ShadowRoot): HTMLElement {
  const existing = shadowRoot.querySelector(".vc-multi-layer");
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const layer = shadowRoot.ownerDocument.createElement("div");
  layer.className = "vc-multi-layer vc-overlay-root";
  shadowRoot.appendChild(layer);
  return layer;
}
