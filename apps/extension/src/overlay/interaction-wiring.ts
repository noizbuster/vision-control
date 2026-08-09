import type { Operation } from "@vision-control/change-ir";
import type { Journal } from "@vision-control/change-journal";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { MoveCancelReason, MoveDiagnostic } from "@vision-control/interaction-machine";
import type { OverlayElement } from "@vision-control/overlay-ui";
import type { PreviewManager, UnbindFn } from "@vision-control/preview-engine";

import {
  createReparentController,
  type ReparentController,
  type ReparentControllerCallbacks,
} from "../components/interaction/index.js";
import {
  ReorderController,
  type ReorderDiagnostic,
} from "../components/interaction/ReorderController.js";
import {
  createResizeController,
  type ResizeDiagnostic,
} from "../components/interaction/ResizeController.js";
import { createMoveRejectionStatusMessage } from "../messaging/move-rejection-messages.js";
import { createFlexResizeStatusMessage } from "../messaging/resize-messages.js";
import { createGridDragController, type GridDragController } from "./grid-drag-controller.js";
import { createGroupMoveRouter, type GroupMoveRouter } from "./group-move-router.js";
import { createInteractionMoveFeedback } from "./interaction-move-feedback.js";
import {
  createInteractionOperationRecorder,
  type InteractionOperationRecorderBus,
} from "./interaction-operation-recorder.js";
import { createInteractionReparentFeedback } from "./interaction-reparent-feedback.js";
import type { SelectionContext } from "./interaction-selection-capture.js";
import { createMoveDragController, type MoveDragController } from "./move-drag-controller.js";
import type { OverlayRuntimeBus } from "./overlay-runtime.js";

export type { SelectionContext } from "./interaction-selection-capture.js";
export {
  captureSelectionContext,
  getOrAssignPreviewRuntimeId,
} from "./interaction-selection-capture.js";

export type InteractionDiagnostic = ReorderDiagnostic | MoveDiagnostic;

export interface InteractionWiringOptions {
  readonly overlayElement: OverlayElement;
  readonly overlayContainer: HTMLElement;
  readonly previewManager: PreviewManager;
  readonly bus: InteractionBus;
  readonly document?: Document;
  readonly onDiagnostic?: (diagnostic: InteractionDiagnostic) => void;
  readonly bindPreviewElement?: (runtimeId: string, element: Element) => UnbindFn;
  readonly onResizeDiagnostic?: (diagnostic: ResizeDiagnostic) => void;
  readonly onReparentStateChange?: ReparentControllerCallbacks["onStateChange"];
  readonly onOperationApplied?: (operation: Operation) => void;
}

export interface InteractionBus extends InteractionOperationRecorderBus {
  readonly send: OverlayRuntimeBus["send"];
  readonly on: OverlayRuntimeBus["on"];
}

export interface InteractionControllers {
  readonly reorder: ReorderController;
  readonly resize: ReturnType<typeof createResizeController>;
  readonly reparent: ReparentController;
  readonly groupMove: GroupMoveRouter;
  readonly gridDrag: GridDragController;
  readonly attach: () => void;
  readonly detachMove: (reason?: MoveCancelReason) => void;
  readonly detach: (reason?: MoveCancelReason) => void;
  readonly onSelectionChange: (context: SelectionContext | null) => void;
  readonly getJournal: () => Journal;
  readonly getRecordedOperations: () => readonly Operation[];
  readonly dispose: () => void;
}

const isMultiSelectGroup = (payload: unknown): payload is MultiSelectGroup =>
  typeof payload === "object" &&
  payload !== null &&
  "id" in payload &&
  "members" in payload &&
  "boundingRect" in payload &&
  "shadowRootCompatible" in payload;

export function createInteractionControllers(
  options: InteractionWiringOptions,
): InteractionControllers {
  const { overlayElement, overlayContainer, previewManager, bus } = options;
  const overlayRoot = overlayContainer.getRootNode();
  if (!(overlayRoot instanceof ShadowRoot)) {
    throw new Error("Interaction overlay container must be attached to a shadow root");
  }

  const recorder = createInteractionOperationRecorder({
    bus,
    ...(options.onOperationApplied !== undefined
      ? { onOperationApplied: options.onOperationApplied }
      : {}),
  });
  let selectedContext: SelectionContext | null = null;
  const publishMoveRejection = (message: string | null): void => {
    bus.send("panel", createMoveRejectionStatusMessage(message === null ? null : { message }));
  };
  const reportMoveDiagnostic = (diagnostic: MoveDiagnostic): void => {
    publishMoveRejection(diagnostic.message);
    options.onDiagnostic?.(diagnostic);
  };

  const reorder = new ReorderController({
    overlayContainer,
    previewManager,
    recordOperation: recorder.record,
    onDiagnostic: (diagnostic) => options.onDiagnostic?.(diagnostic),
  });
  const resize = createResizeController({
    overlayElement,
    previewEngine: previewManager,
    bus,
    onRecordOperation: recorder.record,
    onDiagnostic: options.onResizeDiagnostic ?? (() => {}),
    onStatus: (status) => bus.send("panel", createFlexResizeStatusMessage(status)),
  });
  const moveFeedback = createInteractionMoveFeedback(overlayRoot, overlayContainer);
  const reparentFeedback = createInteractionReparentFeedback({
    overlayRoot,
    overlayContainer,
    ...(options.onReparentStateChange !== undefined
      ? { onStateChange: options.onReparentStateChange }
      : {}),
  });
  const reparent = createReparentController({
    callbacks: reparentFeedback.callbacks,
    previewEngine: previewManager,
    journal: { record: recorder.record },
  });
  const groupMove = createGroupMoveRouter({ reorder, reparent });
  const groupMoveUnsubscribe = bus.on("multi-select-group", (message) => {
    if (message.payload === null) {
      groupMove.setGroup(null);
      return;
    }
    if (isMultiSelectGroup(message.payload)) groupMove.setGroup(message.payload);
  });
  const gridDrag = createGridDragController({ reorder });
  const move: MoveDragController = createMoveDragController({
    document: options.document ?? document,
    overlayHost: overlayRoot.host as HTMLElement,
    overlayElement,
    feedback: moveFeedback,
    getSelection: () => selectedContext,
    preview: (operation) => previewManager.applyOperation(operation),
    ...(options.bindPreviewElement === undefined
      ? {}
      : { bindPreviewElement: options.bindPreviewElement }),
    record: recorder.record,
    onDiagnostic: reportMoveDiagnostic,
  });

  const onSelectionChange = (context: SelectionContext | null): void => {
    selectedContext = context;
    publishMoveRejection(null);
    move.setSelection(context);
    reorder.setSelectedElement(context?.element ?? null);
    if (context === null) {
      resize.detach();
      return;
    }
    resize.attach(context.resize);
  };

  const attach = (): void => {
    publishMoveRejection(null);
    move.attach();
    reorder.attach();
  };

  const detachMove = (reason: MoveCancelReason = "mode-switch"): void => {
    move.detach(reason);
    reorder.detach();
    moveFeedback.clear();
    reparentFeedback.clear();
    publishMoveRejection(null);
  };

  const detach = (reason: MoveCancelReason = "mode-switch"): void => {
    detachMove(reason);
    resize.detach();
  };

  const dispose = (): void => {
    detach();
    resize.destroy();
    groupMoveUnsubscribe();
    recorder.dispose();
  };

  return {
    reorder,
    resize,
    reparent,
    groupMove,
    gridDrag,
    attach,
    detachMove,
    detach,
    onSelectionChange,
    getJournal: recorder.getJournal,
    getRecordedOperations: recorder.getRecordedOperations,
    dispose,
  };
}
