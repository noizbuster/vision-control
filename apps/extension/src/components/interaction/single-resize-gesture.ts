import { createOperationId, type ResizeElementOperation } from "@vision-control/change-ir";
import type { Point } from "@vision-control/geometry";
import {
  createPointerId,
  createResizeOperation,
  type ResizeModifiers,
  type ResizeOperation,
  type ResizeTarget,
} from "@vision-control/interaction-machine";
import type { ResizeHandlePosition } from "@vision-control/overlay-ui";
import type { PreviewManager } from "@vision-control/preview-engine";

export interface SingleResizeGestureOptions {
  readonly previewEngine: PreviewManager;
  readonly onCommit: (operation: ResizeElementOperation) => void;
}

export interface SingleResizeBeginInput {
  readonly handleElement: HTMLElement;
  readonly handle: ResizeHandlePosition;
  readonly event: PointerEvent;
  readonly target: ResizeTarget;
}

export interface SingleResizeGesture {
  readonly begin: (input: SingleResizeBeginInput) => void;
  readonly move: (event: PointerEvent) => void;
  readonly end: (event: PointerEvent) => void;
  readonly cancel: (event: PointerEvent) => void;
  readonly lostCapture: (event: PointerEvent) => void;
  readonly cancelActive: () => void;
}

interface ActiveGesture {
  readonly operation: ResizeOperation;
  readonly target: ResizeTarget;
  readonly handle: ResizeHandlePosition;
  readonly handleElement: HTMLElement;
  readonly startPointer: Point;
  readonly pointerId: number;
  previewRollback: (() => void) | null;
}

interface LatestPointer {
  readonly x: number;
  readonly y: number;
  readonly modifiers: ResizeModifiers;
}

const modifiersFrom = (event: PointerEvent): ResizeModifiers => ({
  shift: event.shiftKey,
  alt: event.altKey,
});

const previewOperation = (target: ResizeTarget, value: number): ResizeElementOperation => ({
  id: createOperationId(),
  timestamp: Date.now(),
  runtime: true,
  origin: "canvas-drag",
  confidence: 1,
  kind: "resize-element",
  element: target.element,
  property: target.property,
  fromValue: String(target.fromValue),
  toValue: String(value),
  unit: target.unit,
});

export function createSingleResizeGesture(
  options: SingleResizeGestureOptions,
): SingleResizeGesture {
  let active: ActiveGesture | null = null;
  let latest: LatestPointer | null = null;
  let rafId: number | null = null;

  const rollbackPreview = (gesture: ActiveGesture): void => {
    gesture.previewRollback?.();
    gesture.previewRollback = null;
  };

  const cancelRaf = (): void => {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  };

  const applyPreview = (): void => {
    if (active === null || latest === null) return;
    const delta = {
      x: latest.x - active.startPointer.x,
      y: latest.y - active.startPointer.y,
    };
    const preview = active.operation.updateResize(delta.x, delta.y, latest.modifiers);
    if (preview === null) return;
    rollbackPreview(active);
    active.previewRollback = options.previewEngine.applyOperation(
      previewOperation(active.target, preview.value),
    );
  };

  const schedulePreview = (): void => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      applyPreview();
    });
  };

  const clear = (releaseCapture: boolean): ActiveGesture | null => {
    cancelRaf();
    const gesture = active;
    active = null;
    latest = null;
    if (gesture === null) return null;
    rollbackPreview(gesture);
    if (releaseCapture) gesture.handleElement.releasePointerCapture(gesture.pointerId);
    return gesture;
  };

  const begin = (input: SingleResizeBeginInput): void => {
    if (active !== null) return;
    input.handleElement.setPointerCapture(input.event.pointerId);
    const operation = createResizeOperation();
    operation.beginResize(
      input.handle,
      createPointerId(String(input.event.pointerId)),
      input.target,
    );
    active = {
      operation,
      target: input.target,
      handle: input.handle,
      handleElement: input.handleElement,
      startPointer: { x: input.event.clientX, y: input.event.clientY },
      pointerId: input.event.pointerId,
      previewRollback: null,
    };
    latest = {
      x: input.event.clientX,
      y: input.event.clientY,
      modifiers: modifiersFrom(input.event),
    };
  };

  const move = (event: PointerEvent): void => {
    if (active === null || event.pointerId !== active.pointerId) return;
    latest = { x: event.clientX, y: event.clientY, modifiers: modifiersFrom(event) };
    schedulePreview();
  };

  const end = (event: PointerEvent): void => {
    if (active === null || event.pointerId !== active.pointerId) return;
    cancelRaf();
    latest = { x: event.clientX, y: event.clientY, modifiers: modifiersFrom(event) };
    applyPreview();
    const gesture = clear(true);
    const result = gesture?.operation.endResize() ?? null;
    if (result !== null) options.onCommit(result.operation);
  };

  const cancel = (event: PointerEvent): void => {
    if (active === null || event.pointerId !== active.pointerId) return;
    clear(true);
  };

  const lostCapture = (event: PointerEvent): void => {
    if (active === null || event.pointerId !== active.pointerId) return;
    clear(false);
  };

  const cancelActive = (): void => {
    clear(true);
  };

  return { begin, move, end, cancel, lostCapture, cancelActive };
}
