import type { Operation } from "@vision-control/change-ir";
import type { Journal } from "@vision-control/change-journal";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { OverlayElement } from "@vision-control/overlay-ui";
import type { PreviewManager } from "@vision-control/preview-engine";

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
import {
  createInteractionOperationRecorder,
  type InteractionOperationRecorderBus,
} from "./interaction-operation-recorder.js";
import { createInteractionReparentFeedback } from "./interaction-reparent-feedback.js";
import type { SelectionContext } from "./interaction-selection-capture.js";
import type { OverlayRuntimeBus } from "./overlay-runtime.js";
import {
  createReparentDragController,
  type ReparentDragController,
} from "./reparent-drag-controller.js";

export type { SelectionContext } from "./interaction-selection-capture.js";
export {
  captureSelectionContext,
  getOrAssignPreviewRuntimeId,
} from "./interaction-selection-capture.js";

export interface InteractionWiringOptions {
  readonly overlayElement: OverlayElement;
  readonly overlayContainer: HTMLElement;
  readonly previewManager: PreviewManager;
  readonly bus: InteractionBus;
  readonly document?: Document;
  readonly onDiagnostic?: (diagnostic: ReorderDiagnostic) => void;
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
  readonly detachMove: () => void;
  readonly detach: () => void;
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
  const reportMoveDiagnostic = (diagnostic: ReorderDiagnostic): void => {
    publishMoveRejection(diagnostic.message);
    options.onDiagnostic?.(diagnostic);
  };

  const reorder = new ReorderController({
    overlayContainer,
    previewManager,
    recordOperation: recorder.record,
    onDiagnostic: options.onDiagnostic ?? (() => {}),
    onMoveRejection: reportMoveDiagnostic,
  });
  const resize = createResizeController({
    overlayElement,
    previewEngine: previewManager,
    bus,
    onRecordOperation: recorder.record,
    onDiagnostic: options.onResizeDiagnostic ?? (() => {}),
    onStatus: (status) => bus.send("panel", createFlexResizeStatusMessage(status)),
  });
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
  const reparentDrag: ReparentDragController = createReparentDragController({
    document: options.document ?? document,
    reorder,
    reparent,
    getSelectionContext: () => selectedContext,
  });

  const onSelectionChange = (context: SelectionContext | null): void => {
    selectedContext = context;
    publishMoveRejection(null);
    reorder.setSelectedElement(context?.element ?? null);
    if (context === null) {
      resize.detach();
      return;
    }
    resize.attach(context.resize);
  };

  const attach = (): void => {
    publishMoveRejection(null);
    reparentDrag.attach();
    reorder.attach();
  };

  const detachMove = (): void => {
    reparentDrag.detach();
    reorder.detach();
    reparentFeedback.clear();
    publishMoveRejection(null);
  };

  const detach = (): void => {
    detachMove();
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
