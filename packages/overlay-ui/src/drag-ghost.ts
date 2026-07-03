/**
 * Drag ghost / placeholder (PRD §8.2, "drag ghost 또는 placeholder").
 *
 * `ghost` — a translucent copy of the dragged element following the pointer.
 * `placeholder` — a dashed outline marking where the element will land.
 * Both are advisory; pointer-events: none.
 */

import type { Rect } from "@vision-control/geometry";

export type DragGhostKind = "ghost" | "placeholder";

export interface DragGhostState {
  readonly rect: Rect;
  readonly kind: DragGhostKind;
}

export interface DragGhost {
  readonly showDragGhost: (state: DragGhostState) => void;
  readonly clear: () => void;
}

export function createDragGhost(container: HTMLElement): DragGhost {
  const document = container.ownerDocument;
  const element = document.createElement("div");
  element.className = "vc-drag-ghost";
  element.style.display = "none";
  element.style.pointerEvents = "none";
  container.appendChild(element);

  const showDragGhost = (state: DragGhostState): void => {
    element.className = state.kind === "placeholder" ? "vc-drag-placeholder" : "vc-drag-ghost";
    element.style.display = "block";
    element.style.left = `${state.rect.x}px`;
    element.style.top = `${state.rect.y}px`;
    element.style.width = `${state.rect.width}px`;
    element.style.height = `${state.rect.height}px`;
  };

  const clear = (): void => {
    element.style.display = "none";
  };

  return { showDragGhost, clear };
}
