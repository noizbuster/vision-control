import { createOperationId } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";
import type { CandidateContainer } from "@vision-control/interaction-machine";
import { classifyLayoutRole, validateReparent } from "@vision-control/layout-engine";
import { PREVIEW_ID_ATTR } from "@vision-control/preview-engine";

import type { ReparentController } from "../components/interaction/index.js";
import type { ReorderController } from "../components/interaction/ReorderController.js";
import type { SelectionContext } from "./interaction-wiring.js";

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
    const selection = getSelectionContext();
    if (selection === null || event.target !== selection.element) return;
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
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pending === null || event.pointerId !== pending.pointerId) return;
    if (!pending.reparentActive && !hasExceededThreshold(pending, event)) return;

    const candidate = findCandidateContainer(
      doc,
      pending.selection.element,
      pending.sourceParent,
      event.clientX,
      event.clientY,
    );
    if (candidate === null) return;

    if (!pending.reparentActive) {
      reorder.detach();
      reparent.begin(
        String(pending.pointerId),
        descriptorFor(pending.selection.element),
        descriptorFor(pending.sourceParent),
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
      reparent.end();
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
  };

  const detach = (): void => {
    if (!attached) return;
    attached = false;
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("pointermove", onPointerMove, true);
    doc.removeEventListener("pointerup", onPointerUp, true);
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

function descriptorFor(element: Element): CandidateContainer["parent"] {
  return {
    ref: {
      runtimeId: getOrAssignRuntimeId(element),
      tagName: element.tagName.toLowerCase(),
    },
    tagName: element.tagName.toLowerCase(),
  };
}

function candidateFor(element: Element, dragged: Element): CandidateContainer {
  const view = element.ownerDocument.defaultView ?? window;
  const style = view.getComputedStyle(element);
  return {
    parent: descriptorFor(element),
    layoutRole: classifyLayoutRole({
      display: style.display,
      flexDirection: style.flexDirection,
      position: style.position,
    }),
    flexDirection: style.flexDirection,
    rect: rectFor(element),
    children: Array.from(element.children)
      .filter((child) => child !== dragged)
      .map((child) => ({ rect: rectFor(child) })),
  };
}

function findCandidateContainer(
  doc: Document,
  dragged: Element,
  sourceParent: Element,
  x: number,
  y: number,
): CandidateContainer | null {
  for (const element of elementsAtPoint(doc, x, y)) {
    if (
      element === dragged ||
      dragged.contains(element) ||
      sourceParent.contains(element) ||
      element.contains(sourceParent)
    ) {
      continue;
    }
    if (!validateReparent(element.tagName.toLowerCase(), dragged.tagName.toLowerCase()).ok) {
      continue;
    }
    return candidateFor(element, dragged);
  }
  return null;
}

function elementsAtPoint(doc: Document, x: number, y: number): readonly Element[] {
  if (typeof doc.elementsFromPoint === "function") {
    return doc.elementsFromPoint(x, y);
  }
  return Array.from(doc.querySelectorAll("*"))
    .filter((element) => containsPoint(element, x, y))
    .sort((a, b) => area(rectFor(a)) - area(rectFor(b)));
}

function containsPoint(element: Element, x: number, y: number): boolean {
  const rect = rectFor(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function rectFor(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function area(rect: Rect): number {
  return rect.width * rect.height;
}

function getOrAssignRuntimeId(element: Element): string {
  const existing = element.getAttribute(PREVIEW_ID_ATTR);
  if (existing !== null && existing.length > 0) return existing;
  const runtimeId = `vc-reparent-${createOperationId()}`;
  element.setAttribute(PREVIEW_ID_ATTR, runtimeId);
  return runtimeId;
}
