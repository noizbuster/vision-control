import {
  beginMove,
  cancelMove,
  commitMove,
  endMove,
  type MoveCancelReason,
  type MoveDiagnostic,
  type MoveOperation,
  type MoveSource,
  type MoveState,
  updateMove,
} from "@vision-control/interaction-machine";
import type { OverlayElement } from "@vision-control/overlay-ui";

import {
  getOrAssignMoveRuntimeId,
  measureMoveSourceContext,
} from "../components/interaction/reorder-dom-context.js";
import type { MoveFeedback } from "./interaction-move-feedback.js";
import type { SelectionContext } from "./interaction-selection-capture.js";
import { createMoveAutoScroller } from "./move-auto-scroll.js";
import {
  buildMoveElementDescriptor,
  type MoveDropResolution,
  resolveMoveDropTarget,
} from "./move-drop-target.js";

export interface MoveDragController {
  readonly attach: () => void;
  readonly detach: (reason: MoveCancelReason) => void;
  readonly setSelection: (selection: SelectionContext | null) => void;
  readonly dispose: () => void;
}

export interface MoveDragControllerOptions {
  readonly document: Document;
  readonly overlayHost: HTMLElement;
  readonly overlayElement: OverlayElement;
  readonly feedback: MoveFeedback;
  readonly getSelection: () => SelectionContext | null;
  readonly preview: (operation: MoveOperation) => () => void;
  readonly bindPreviewElement?: (runtimeId: string, element: Element) => () => void;
  readonly record: (operation: MoveOperation) => void;
  readonly onDiagnostic: (diagnostic: MoveDiagnostic) => void;
}

type ArmedGesture = {
  readonly kind: "armed";
  readonly pointerId: number;
  readonly selected: Element;
  readonly start: { readonly x: number; readonly y: number };
};

type ActiveGesture = {
  readonly kind: "dragging";
  readonly pointerId: number;
  readonly selected: Element;
  readonly sourceParent: Element;
  readonly sourceIndex: number;
  readonly source: MoveSource;
  point: { readonly x: number; readonly y: number };
  state: MoveState;
  previous: Extract<MoveDropResolution, { readonly kind: "valid" }> | undefined;
};

type Gesture = ArmedGesture | ActiveGesture | null;

const isSkeletonElement = (element: Element): boolean => {
  const doc = element.ownerDocument;
  return element === doc.documentElement || element === doc.head || element === doc.body;
};

const pointFor = (event: PointerEvent): { readonly x: number; readonly y: number } => ({
  x: event.clientX,
  y: event.clientY,
});

/** Owns the only browser pointer lifecycle for Move. Keyboard reorder remains separate. */
export const createMoveDragController = (
  options: MoveDragControllerOptions,
): MoveDragController => {
  let attached = false;
  let gesture: Gesture = null;
  let suppressClick = false;

  const sourceRemains = (active: ActiveGesture): boolean =>
    active.selected.isConnected &&
    active.selected.parentElement === active.sourceParent &&
    Array.from(active.sourceParent.children).indexOf(active.selected) === active.sourceIndex;

  const autoScroller = createMoveAutoScroller({
    document: options.document,
    onScrollFrame: () => {
      if (gesture?.kind !== "dragging") return;
      if (!sourceRemains(gesture)) {
        diagnostic(
          "source-changed",
          "Move cancelled because the selected DOM changed during drag.",
        );
        cancel("source-changed");
        return;
      }
      update(gesture, {
        clientX: gesture.point.x,
        clientY: gesture.point.y,
      } as PointerEvent);
    },
  });

  const clear = (): void => {
    const active = gesture;
    gesture = null;
    autoScroller.stop();
    options.overlayElement.setDragGhost(null);
    options.feedback.clear();
    if (active?.kind === "dragging" && active.selected.hasPointerCapture(active.pointerId)) {
      active.selected.releasePointerCapture(active.pointerId);
    }
    suppressClick = false;
  };
  const diagnostic = (code: MoveDiagnostic["code"], message: string): void => {
    options.onDiagnostic({ code, message });
  };

  const currentSelection = (event: PointerEvent): Element | null => {
    const selection = options.getSelection();
    if (
      selection === null ||
      !selection.element.isConnected ||
      !(event.target instanceof Element) ||
      !selection.element.contains(event.target)
    ) {
      return null;
    }
    return selection.element;
  };

  const render = (resolution: MoveDropResolution): void => {
    if (resolution.kind === "valid") {
      const { indicator } = resolution.insertion;
      const rect =
        indicator.axis === "x"
          ? {
              x: indicator.position - 1,
              y: indicator.spanStart,
              width: 2,
              height: indicator.spanSize,
            }
          : {
              x: indicator.spanStart,
              y: indicator.position - 1,
              width: indicator.spanSize,
              height: 2,
            };
      options.feedback.render({
        targetRect: resolution.candidate.parentRect,
        validity: "valid",
        warning: null,
        indicator: { rect, orientation: indicator.axis === "x" ? "vertical" : "horizontal" },
      });
      return;
    }
    if (resolution.kind === "invalid") {
      options.feedback.render({
        targetRect: resolution.rect,
        validity: "invalid",
        warning: resolution.diagnostic.message,
        indicator: null,
      });
      return;
    }
    options.feedback.clear();
  };

  const resolve = (active: ActiveGesture, event: PointerEvent): MoveDropResolution => {
    const root = active.selected.getRootNode();
    if (!(root instanceof Document || root instanceof ShadowRoot)) return { kind: "none" };
    return resolveMoveDropTarget({
      document: options.document,
      root,
      overlayHost: options.overlayHost,
      dragged: active.selected,
      sourceParent: active.sourceParent,
      idFor: getOrAssignMoveRuntimeId,
      pointer: pointFor(event),
      movingOrder: active.source.order,
      sourceIndex: active.sourceIndex,
      ...(active.previous === undefined ? {} : { previous: active.previous }),
    });
  };

  const update = (active: ActiveGesture, event: PointerEvent): MoveDropResolution => {
    active.point = pointFor(event);
    const resolution = resolve(active, event);
    active.state = updateMove(
      active.state,
      active.point,
      resolution.kind === "valid" ? resolution.candidate : null,
    );
    if (
      active.state.kind === "dragging" &&
      active.state.evaluation.kind === "valid" &&
      resolution.kind === "valid"
    ) {
      active.previous = resolution;
      render(resolution);
    } else {
      active.previous = undefined;
      render(resolution);
      if (resolution.kind === "invalid")
        diagnostic(resolution.diagnostic.code, resolution.diagnostic.message);
    }
    options.overlayElement.setDragGhost({
      kind: "ghost",
      rect: {
        x: active.source.sourceRect.x + active.point.x - active.source.startPoint.x,
        y: active.source.sourceRect.y + active.point.y - active.source.startPoint.y,
        width: active.source.sourceRect.width,
        height: active.source.sourceRect.height,
      },
    });
    autoScroller.update({
      point: active.point,
      scrollAnchor: resolution.kind === "none" ? null : resolution.scrollAnchor,
      windowFallback: resolution.kind === "none",
    });
    return resolution;
  };

  const beginActive = (armed: ArmedGesture, event: PointerEvent): ActiveGesture | null => {
    const parent = armed.selected.parentElement;
    if (parent === null || !armed.selected.isConnected || !parent.isConnected) {
      diagnostic("source-changed", "Move cancelled because the selected DOM changed during drag.");
      return null;
    }
    if (isSkeletonElement(armed.selected)) {
      diagnostic("unsupported-context", "Move does not support moving document skeleton elements.");
      return null;
    }
    const index = Array.from(parent.children).indexOf(armed.selected);
    const sourceContext = measureMoveSourceContext(armed.selected, parent);
    if (!sourceContext.ok || index < 0) {
      diagnostic(
        sourceContext.ok ? "source-changed" : sourceContext.diagnostic.kind,
        sourceContext.ok
          ? "Move cancelled because the selected DOM changed during drag."
          : sourceContext.diagnostic.message,
      );
      return null;
    }
    try {
      armed.selected.setPointerCapture(event.pointerId);
      if (!armed.selected.hasPointerCapture(event.pointerId)) {
        diagnostic("pointer-capture-failed", "Move could not acquire pointer capture.");
        return null;
      }
    } catch {
      diagnostic("pointer-capture-failed", "Move could not acquire pointer capture.");
      return null;
    }
    const source: MoveSource = {
      element: buildMoveElementDescriptor(armed.selected, getOrAssignMoveRuntimeId(armed.selected)),
      sourceParent: buildMoveElementDescriptor(parent, getOrAssignMoveRuntimeId(parent)),
      sourceIndex: index,
      startPoint: armed.start,
      sourceRect: sourceContext.measurement.sourceRect,
      order: sourceContext.measurement.order,
      sourceParentRole: sourceContext.measurement.sourceParentRole,
      sourceContextPositioned: sourceContext.measurement.sourceContextPositioned,
    };
    const active: ActiveGesture = {
      kind: "dragging",
      pointerId: armed.pointerId,
      selected: armed.selected,
      sourceParent: parent,
      sourceIndex: index,
      source,
      point: armed.start,
      state: beginMove(source, String(armed.pointerId) as never),
      previous: undefined,
    };
    options.feedback.clear();
    return active;
  };

  const cancel = (reason: MoveCancelReason): void => {
    if (gesture?.kind === "dragging") gesture.state = cancelMove(gesture.state, reason);
    clear();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (gesture !== null || !event.isPrimary || event.button !== 0) return;
    const selected = currentSelection(event);
    if (selected === null) return;
    gesture = { kind: "armed", pointerId: event.pointerId, selected, start: pointFor(event) };
    suppressClick = true;
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (gesture === null || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    if (gesture.kind === "armed") {
      const distance = Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y);
      if (distance < 4) return;
      const active = beginActive(gesture, event);
      if (active === null) {
        gesture = null;
        return;
      }
      try {
        active.selected.setPointerCapture(active.pointerId);
      } catch {
        diagnostic("pointer-capture-failed", "Move could not capture the pointer.");
        cancel("pointer-capture-failed");
        return;
      }
      gesture = active;
    }
    if (!sourceRemains(gesture)) {
      diagnostic("source-changed", "Move cancelled because the selected DOM changed during drag.");
      cancel("source-changed");
      return;
    }
    update(gesture, event);
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (gesture === null || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    if (gesture.kind === "armed") {
      clear();
      return;
    }
    const active = gesture;
    if (!sourceRemains(gesture)) {
      diagnostic("source-changed", "Move cancelled because the selected DOM changed during drag.");
      cancel("source-changed");
      return;
    }
    update(active, event);
    const result = endMove(active.state);
    if (result.operation === null) {
      if (result.diagnostic !== null) diagnostic(result.diagnostic.code, result.diagnostic.message);
      clear();
      return;
    }
    const bindings = [
      options.bindPreviewElement?.(active.source.element.ref.runtimeId, active.selected),
      options.bindPreviewElement?.(active.source.sourceParent.ref.runtimeId, active.sourceParent),
      ...(active.previous === undefined
        ? []
        : [
            options.bindPreviewElement?.(
              active.previous.candidate.targetParent.ref.runtimeId,
              active.previous.targetElement,
            ),
          ]),
    ];
    try {
      const rollback = options.preview(result.operation);
      for (const unbind of bindings) unbind?.();
      try {
        options.record(result.operation);
        active.state = commitMove(result.state);
      } catch (error) {
        rollback();
        throw error;
      }
    } catch {
      for (const unbind of bindings) unbind?.();
      diagnostic("release-validation-failed", "Move preview could not be committed.");
    }
    clear();
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (gesture !== null && event.pointerId === gesture.pointerId) {
      event.preventDefault();
      cancel("pointer-cancel");
    }
  };

  const onLostPointerCapture = (event: PointerEvent): void => {
    if (gesture?.kind === "dragging" && event.pointerId === gesture.pointerId)
      cancel("lost-pointer-capture");
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (gesture === null) return;
    if (event.key.startsWith("Arrow") || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") cancel("escape");
    }
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  };

  const onBlur = (): void => cancel("window-blur");

  const attach = (): void => {
    if (attached) return;
    attached = true;
    options.document.addEventListener("pointerdown", onPointerDown, true);
    options.document.addEventListener("pointermove", onPointerMove, true);
    options.document.addEventListener("pointerup", onPointerUp, true);
    options.document.addEventListener("pointercancel", onPointerCancel, true);
    options.document.addEventListener("lostpointercapture", onLostPointerCapture, true);
    options.document.addEventListener("keydown", onKeyDown, true);
    options.document.addEventListener("dragstart", onClick, true);
    options.document.defaultView?.addEventListener("blur", onBlur, true);
    options.document.defaultView?.addEventListener("click", onClick, true);
  };

  const detach = (reason: MoveCancelReason): void => {
    if (!attached) return;
    attached = false;
    cancel(reason);
    options.document.removeEventListener("pointerdown", onPointerDown, true);
    options.document.removeEventListener("pointermove", onPointerMove, true);
    options.document.removeEventListener("pointerup", onPointerUp, true);
    options.document.removeEventListener("pointercancel", onPointerCancel, true);
    options.document.removeEventListener("lostpointercapture", onLostPointerCapture, true);
    options.document.removeEventListener("keydown", onKeyDown, true);
    options.document.removeEventListener("dragstart", onClick, true);
    options.document.defaultView?.removeEventListener("blur", onBlur, true);
    options.document.defaultView?.removeEventListener("click", onClick, true);
  };
  return {
    attach,
    detach,
    setSelection: () => cancel("selection-changed"),
    dispose: () => {
      detach("controller-detached");
      autoScroller.dispose();
    },
  };
};
