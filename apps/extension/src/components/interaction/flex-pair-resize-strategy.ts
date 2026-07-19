import type { ResizeFlexPairOperation } from "@vision-control/change-ir";
import type { Point } from "@vision-control/geometry";
import type { FlexDiagnostic, PairedFlexResizeCandidate } from "@vision-control/layout-engine";
import type { PreviewManager, PreviewTransaction } from "@vision-control/preview-engine";
import type { PreparedFlexPairResize } from "./flex-pair-resize-model.js";
import {
  buildFlexPairOperation,
  measureAndValidateFlexPair,
} from "./flex-pair-resize-operation.js";
import {
  type AppliedFlexPairCandidate,
  applyFlexPairCandidate,
  computeFlexPairDelta,
  type FlexPairPointer,
} from "./flex-pair-resize-preview.js";

export interface FlexPairResizeStrategyOptions {
  readonly previewEngine: PreviewManager;
  readonly onCommit: (operation: ResizeFlexPairOperation) => void;
  readonly onDiagnostic: (diagnostic: FlexDiagnostic) => void;
}

export interface FlexPairResizeBeginInput {
  readonly prepared: PreparedFlexPairResize;
  readonly handleElement: HTMLElement;
  readonly event: PointerEvent;
}

export interface FlexPairResizeStrategy {
  readonly begin: (input: FlexPairResizeBeginInput) => void;
  readonly move: (event: PointerEvent) => void;
  readonly end: (event: PointerEvent) => void;
  readonly cancel: (event: PointerEvent) => void;
  readonly lostCapture: (event: PointerEvent) => void;
  readonly cancelActive: () => void;
}

interface GestureBase {
  readonly id: string;
  readonly generation: number;
  readonly prepared: PreparedFlexPairResize;
  readonly handleElement: HTMLElement;
  readonly pointerId: number;
  readonly startPointer: Point;
}

type GestureState =
  | (GestureBase & {
      readonly kind: "dragging";
      readonly transaction: PreviewTransaction | null;
    })
  | (GestureBase & {
      readonly kind: "validating";
      readonly transaction: PreviewTransaction;
      readonly candidate: PairedFlexResizeCandidate;
    });

const gestureId = (generation: number, pointerId: number): string =>
  `flex-pair-${generation}-${pointerId}`;

export function createFlexPairResizeStrategy(
  options: FlexPairResizeStrategyOptions,
): FlexPairResizeStrategy {
  let gestureGeneration = 0;
  let state: GestureState | null = null;
  let latest: FlexPairPointer | null = null;
  let previewRafId: number | null = null;
  let validationRafId: number | null = null;

  const rollback = (gesture: GestureState): void => {
    gesture.transaction?.rollback();
  };

  const cancelFrames = (): void => {
    if (previewRafId !== null) cancelAnimationFrame(previewRafId);
    if (validationRafId !== null) cancelAnimationFrame(validationRafId);
    previewRafId = null;
    validationRafId = null;
  };

  const invalidate = (releaseCapture: boolean): void => {
    gestureGeneration += 1;
    cancelFrames();
    const gesture = state;
    state = null;
    latest = null;
    if (gesture === null) return;
    rollback(gesture);
    if (releaseCapture && gesture.kind === "dragging") {
      gesture.handleElement.releasePointerCapture(gesture.pointerId);
    }
  };

  const applyCandidate = (
    gesture: GestureBase,
    pointer: FlexPairPointer,
  ): AppliedFlexPairCandidate | null =>
    applyFlexPairCandidate({
      prepared: gesture.prepared,
      delta: computeFlexPairDelta({
        prepared: gesture.prepared,
        startPointer: gesture.startPointer,
        pointer,
      }),
      previewEngine: options.previewEngine,
      onDiagnostic: options.onDiagnostic,
    });

  const replacePreview = (
    gesture: GestureState,
    pointer: FlexPairPointer,
  ): AppliedFlexPairCandidate | null => {
    rollback(gesture);
    return applyCandidate(gesture, pointer);
  };

  const applyScheduledPreview = (id: string, generation: number): void => {
    previewRafId = null;
    const gesture = state;
    const pointer = latest;
    if (
      gesture === null ||
      gesture.kind !== "dragging" ||
      gesture.id !== id ||
      gesture.generation !== generation ||
      gestureGeneration !== generation ||
      pointer === null
    ) {
      return;
    }
    const applied = replacePreview(gesture, pointer);
    state = { ...gesture, transaction: applied?.transaction ?? null };
  };

  const schedulePreview = (): void => {
    const gesture = state;
    if (gesture === null || gesture.kind !== "dragging" || previewRafId !== null) return;
    previewRafId = requestAnimationFrame(() =>
      applyScheduledPreview(gesture.id, gesture.generation),
    );
  };

  const finishValidation = (id: string, generation: number): void => {
    validationRafId = null;
    const gesture = state;
    if (
      gesture === null ||
      gesture.kind !== "validating" ||
      gesture.id !== id ||
      gesture.generation !== generation ||
      gestureGeneration !== generation
    ) {
      return;
    }
    const validation = measureAndValidateFlexPair(gesture.prepared, gesture.candidate);
    if (!validation.ok) {
      options.onDiagnostic(validation.diagnostic);
      invalidate(false);
      return;
    }
    const committed = buildFlexPairOperation({
      prepared: gesture.prepared,
      candidate: gesture.candidate,
      runtime: false,
      frame: validation.frame,
    });
    if (!committed.ok) {
      options.onDiagnostic(committed.diagnostic);
      invalidate(false);
      return;
    }
    gesture.transaction.commit();
    state = null;
    latest = null;
    options.onCommit(committed.operation);
  };

  const begin = (input: FlexPairResizeBeginInput): void => {
    if (state !== null) return;
    gestureGeneration += 1;
    input.handleElement.setPointerCapture(input.event.pointerId);
    state = {
      kind: "dragging",
      id: gestureId(gestureGeneration, input.event.pointerId),
      generation: gestureGeneration,
      prepared: input.prepared,
      handleElement: input.handleElement,
      pointerId: input.event.pointerId,
      startPointer: { x: input.event.clientX, y: input.event.clientY },
      transaction: null,
    };
    latest = { x: input.event.clientX, y: input.event.clientY, alt: input.event.altKey };
  };

  const move = (event: PointerEvent): void => {
    if (state === null || state.kind !== "dragging" || event.pointerId !== state.pointerId) return;
    latest = { x: event.clientX, y: event.clientY, alt: event.altKey };
    schedulePreview();
  };

  const end = (event: PointerEvent): void => {
    const gesture = state;
    if (gesture === null || gesture.kind !== "dragging" || event.pointerId !== gesture.pointerId) {
      return;
    }
    if (previewRafId !== null) cancelAnimationFrame(previewRafId);
    previewRafId = null;
    latest = { x: event.clientX, y: event.clientY, alt: event.altKey };
    const applied = replacePreview(gesture, latest);
    gesture.handleElement.releasePointerCapture(gesture.pointerId);
    if (applied === null) {
      gestureGeneration += 1;
      state = null;
      latest = null;
      return;
    }
    state = {
      ...gesture,
      kind: "validating",
      transaction: applied.transaction,
      candidate: applied.candidate,
    };
    latest = null;
    validationRafId = requestAnimationFrame(() => finishValidation(gesture.id, gesture.generation));
  };

  const cancel = (event: PointerEvent): void => {
    if (state === null || event.pointerId !== state.pointerId) return;
    invalidate(true);
  };

  const lostCapture = (event: PointerEvent): void => {
    if (state === null || state.kind !== "dragging" || event.pointerId !== state.pointerId) {
      return;
    }
    invalidate(false);
  };

  const cancelActive = (): void => invalidate(true);

  return { begin, move, end, cancel, lostCapture, cancelActive };
}
