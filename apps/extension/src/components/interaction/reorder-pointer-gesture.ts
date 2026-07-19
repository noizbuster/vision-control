import {
  beginReorder,
  createPointerId,
  endReorder,
  type ReorderLayoutContext,
  type ReorderResult,
  type ReorderState,
  type ReorderTarget,
  updateReorder,
} from "@vision-control/interaction-machine";

export interface ReorderPointerGesture {
  readonly attach: () => void;
  readonly detach: () => void;
  readonly isActive: () => boolean;
}

export const createReorderPointerGesture = (options: {
  readonly document: Document;
  readonly resolveStart: (event: PointerEvent) => ReorderTarget | null;
  readonly readContext: () => ReorderLayoutContext | null;
  readonly onStateChange: (state: ReorderState | null) => void;
  readonly onRelease: (result: ReorderResult) => void;
}): ReorderPointerGesture => {
  let state: ReorderState | null = null;
  let active = false;

  const owns = (event: PointerEvent): boolean =>
    state !== null && state.pointerId === String(event.pointerId);

  const onPointerDown = (event: PointerEvent): void => {
    if (state !== null) return;
    const target = options.resolveStart(event);
    if (target === null) return;
    state = beginReorder(target, createPointerId(String(event.pointerId)));
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!owns(event) || state === null) return;
    const context = options.readContext();
    if (context === null) return;
    state = updateReorder(state, event.clientX, event.clientY, context);
    options.onStateChange(state);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!owns(event) || state === null) return;
    const context = options.readContext();
    if (context === null) {
      state = null;
      options.onStateChange(null);
      return;
    }
    const finalState = updateReorder(state, event.clientX, event.clientY, context);
    const result = endReorder(finalState);
    state = null;
    options.onRelease(result);
    options.onStateChange(null);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (!owns(event)) return;
    state = null;
    options.onStateChange(null);
  };

  const attach = (): void => {
    if (active) return;
    active = true;
    options.document.addEventListener("pointerdown", onPointerDown, true);
    options.document.addEventListener("pointermove", onPointerMove, true);
    options.document.addEventListener("pointerup", onPointerUp, true);
    options.document.addEventListener("pointercancel", onPointerCancel, true);
  };

  const detach = (): void => {
    if (!active) return;
    active = false;
    options.document.removeEventListener("pointerdown", onPointerDown, true);
    options.document.removeEventListener("pointermove", onPointerMove, true);
    options.document.removeEventListener("pointerup", onPointerUp, true);
    options.document.removeEventListener("pointercancel", onPointerCancel, true);
    state = null;
    options.onStateChange(null);
  };

  return { attach, detach, isActive: () => active };
};
