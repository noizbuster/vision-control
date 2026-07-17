import type { CandidateContainer } from "@vision-control/interaction-machine";

import type { ReparentController } from "../components/interaction/index.js";
import type { ReorderController } from "../components/interaction/ReorderController.js";
import type { SelectionContext } from "./interaction-wiring.js";
import { describeReparentElement, resolveMoveDropTarget } from "./move-drop-target.js";

export interface ReparentDragController {
  readonly attach: () => void;
  readonly detach: () => void;
  readonly dispose: () => void;
}

export interface ReparentDragControllerOptions {
  readonly document: Document;
  readonly reorder: ReorderController;
  readonly reparent: ReparentController;
  readonly getSelectionContext: () => SelectionContext | null;
}

interface PendingDrag {
  readonly pointerId: number;
  readonly selection: SelectionContext;
  readonly sourceParent: Element;
  readonly startX: number;
  readonly startY: number;
  reparentActive: boolean;
}

const REPARENT_DRAG_THRESHOLD_PX = 4;
export function createReparentDragController(
  options: ReparentDragControllerOptions,
): ReparentDragController {
  const { document: doc, reorder, reparent, getSelectionContext } = options;
  let attached = false;
  let pending: PendingDrag | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    if (pending !== null) return;
    const selection = getSelectionContext();
    if (
      selection === null ||
      !(event.target instanceof Element) ||
      !selection.element.contains(event.target)
    ) {
      return;
    }
    const sourceParent = selection.element.parentElement;
    if (sourceParent === null) return;
    pending = {
      pointerId: event.pointerId,
      selection,
      sourceParent,
      startX: event.clientX,
      startY: event.clientY,
      reparentActive: false,
    };
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pending === null || event.pointerId !== pending.pointerId) return;
    if (!pending.reparentActive && !hasExceededThreshold(pending, event)) return;

    const candidate = resolveCandidate(pending, event);
    if (candidate === null) {
      if (pending.reparentActive) {
        reparent.move(event.clientX, event.clientY, []);
        event.preventDefault();
      }
      return;
    }

    if (!pending.reparentActive) {
      reorder.detach();
      reparent.begin(
        String(pending.pointerId),
        describeReparentElement(pending.selection.element),
        describeReparentElement(pending.sourceParent),
        sourceIndex(pending.selection.element, pending.sourceParent),
      );
      pending.reparentActive = true;
    }

    reparent.move(event.clientX, event.clientY, [candidate]);
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (pending === null || event.pointerId !== pending.pointerId) return;
    const shouldResumeReorder = pending.reparentActive;
    if (pending.reparentActive) {
      const candidate = resolveCandidate(pending, event);
      reparent.move(event.clientX, event.clientY, candidate === null ? [] : [candidate]);
      reparent.end();
      event.preventDefault();
    }
    pending = null;
    if (shouldResumeReorder && attached) {
      reorder.attach();
    }
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (pending === null || event.pointerId !== pending.pointerId) return;
    const shouldResumeReorder = pending.reparentActive;
    if (pending.reparentActive) {
      reparent.cancel("reparent drag cancelled");
      event.preventDefault();
    }
    pending = null;
    if (shouldResumeReorder && attached) {
      reorder.attach();
    }
  };

  const attach = (): void => {
    if (attached) return;
    attached = true;
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointermove", onPointerMove, true);
    doc.addEventListener("pointerup", onPointerUp, true);
    doc.addEventListener("pointercancel", onPointerCancel, true);
  };

  const detach = (): void => {
    if (!attached) return;
    attached = false;
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("pointermove", onPointerMove, true);
    doc.removeEventListener("pointerup", onPointerUp, true);
    doc.removeEventListener("pointercancel", onPointerCancel, true);
    if (pending?.reparentActive === true) {
      reparent.cancel("reparent drag controller detached");
    }
    pending = null;
  };

  return { attach, detach, dispose: detach };
}

function hasExceededThreshold(drag: PendingDrag, event: PointerEvent): boolean {
  return (
    Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
    REPARENT_DRAG_THRESHOLD_PX
  );
}

function sourceIndex(element: Element, parent: Element): number {
  return Array.from(parent.children).indexOf(element);
}

function resolveCandidate(drag: PendingDrag, event: PointerEvent): CandidateContainer | null {
  return resolveMoveDropTarget({
    document: drag.selection.element.ownerDocument,
    dragged: drag.selection.element,
    sourceParent: drag.sourceParent,
    pointer: { x: event.clientX, y: event.clientY },
  });
}
