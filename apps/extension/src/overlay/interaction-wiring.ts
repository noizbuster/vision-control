/**
 * Instantiates and binds the three interaction controllers (reorder, resize,
 * reparent) to the overlay runtime's real dependencies.
 *
 * Each controller emits source-intent operations through a different seam:
 * - {@link ReorderController} calls a `recordOperation` callback.
 * - {@link createResizeController} sends on the bus AND (optionally) the
 *   `onRecordOperation` callback added for journal funneling.
 * - {@link createReparentController} records through a `journal`-shaped object.
 *
 * This module unifies those seams into one funnel that records into the change
 * journal AND forwards the operation to the panel via the bus. It owns a
 * session-scoped {@link Journal} holder and drives controller selection state
 * (reorder's selected element + resize's attach context) from a single
 * {@link onSelectionChange} entry point.
 *
 * PRD constraint 2 (Appendix D.2) is respected by construction: none of the
 * three controllers emit `position-element`. The adversarial guard lives in the
 * controller-layer context checks (`isNormalFlowRole`) and the layout-engine
 * free-position factory; this wiring never introduces a position-element path.
 */

import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import type { LayoutComputedStyle } from "@vision-control/layout-engine";
import type { OverlayElement } from "@vision-control/overlay-ui";
import { PREVIEW_ID_ATTR, type PreviewManager } from "@vision-control/preview-engine";
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
  type SelectedElementContext,
} from "../components/interaction/ResizeController.js";
import { createGridDragController, type GridDragController } from "./grid-drag-controller.js";
import { createGroupMoveRouter, type GroupMoveRouter } from "./group-move-router.js";
import type { OverlayRuntimeBus } from "./overlay-runtime.js";

export interface InteractionWiringOptions {
  readonly overlayElement: OverlayElement;
  readonly overlayContainer: HTMLElement;
  readonly previewManager: PreviewManager;
  readonly bus: InteractionBus;
  readonly onDiagnostic?: (diagnostic: ReorderDiagnostic) => void;
  readonly onReparentStateChange?: ReparentControllerCallbacks["onStateChange"];
}

export interface InteractionBus {
  readonly send: OverlayRuntimeBus["send"];
  readonly on: OverlayRuntimeBus["on"];
}

export interface SelectionContext {
  readonly element: Element;
  readonly elementRef: ElementRef;
  readonly rect: Rect;
  readonly computedStyle: LayoutComputedStyle;
}

export interface InteractionControllers {
  readonly reorder: ReorderController;
  readonly resize: ReturnType<typeof createResizeController>;
  readonly reparent: ReparentController;
  readonly groupMove: GroupMoveRouter;
  readonly gridDrag: GridDragController;
  readonly attach: () => void;
  readonly detach: () => void;
  readonly onSelectionChange: (context: SelectionContext | null) => void;
  readonly getJournal: () => Journal;
  readonly getRecordedOperations: () => readonly Operation[];
  readonly dispose: () => void;
}

export function createInteractionControllers(
  options: InteractionWiringOptions,
): InteractionControllers {
  const { overlayElement, overlayContainer, previewManager, bus } = options;

  const changeSetId = crypto.randomUUID();
  let journal: Journal = createJournal();
  let sequence = 0;
  const recorded: Operation[] = [];

  const recordOperation = (operation: Operation): void => {
    recorded.push(operation);
    journal = appendEntry(
      journal,
      createJournalEntry({
        id: crypto.randomUUID(),
        changeSetId,
        transactionId: crypto.randomUUID(),
        sequence: sequence,
        operation,
      }),
    );
    sequence += 1;
    bus.send("panel", {
      protocolVersion: "1.0.0",
      messageId: `interaction-operation-${operation.id}`,
      messageType: "interaction-operation",
      payload: operation,
      timestamp: Date.now(),
    });
  };

  const reorder = new ReorderController({
    overlayContainer,
    recordOperation,
    onDiagnostic: options.onDiagnostic ?? (() => {}),
  });

  const resize = createResizeController({
    overlayElement,
    previewEngine: previewManager,
    bus,
    onRecordOperation: recordOperation,
  });

  const reparentCallbacks: ReparentControllerCallbacks = {
    onStateChange: options.onReparentStateChange ?? (() => {}),
    onHighlight: () => {},
  };
  const reparent = createReparentController({
    callbacks: reparentCallbacks,
    previewEngine: previewManager,
    journal: { record: recordOperation },
  });

  // Group-move router (plan task 3): the wiring caches the latest
  // multi-select group from the bus (task 2 publishes it) and routes a group
  // drag to reorder.reorderGroup (same-parent) or reparent.reparentGroup
  // (cross-parent). D41 is enforced inside classifyGroupMove in both paths.
  const groupMove = createGroupMoveRouter({ reorder, reparent });
  const groupMoveUnsub = bus.on("multi-select-group", (message) => {
    groupMove.setGroup(message.payload as MultiSelectGroup);
  });

  // Grid-drag router (plan task 4): routes a CSS-Grid drag to
  // reorder.reorderGrid, which resolves the visual goal through resolveGridIntent
  // (dom-order vs grid-area) and records a grid-reorder op. Defaults
  // userChoice "unset" -> grid-area (never a silent DOM-order rewrite); the
  // reading-order a11y warning is surfaced via the onDiagnostic callback below.
  const gridDrag = createGridDragController({ reorder });

  const onSelectionChange = (context: SelectionContext | null): void => {
    reorder.setSelectedElement(context?.element ?? null);
    if (context === null) {
      resize.detach();
      return;
    }
    const resizeContext: SelectedElementContext = {
      element: context.elementRef,
      rect: context.rect,
      computedStyle: context.computedStyle,
    };
    resize.attach(resizeContext);
  };

  const attach = (): void => {
    reorder.attach();
  };

  const detach = (): void => {
    reorder.detach();
    resize.detach();
  };

  const dispose = (): void => {
    detach();
    resize.destroy();
    groupMoveUnsub();
  };

  return {
    reorder,
    resize,
    reparent,
    groupMove,
    gridDrag,
    attach,
    detach,
    onSelectionChange,
    getJournal: () => journal,
    getRecordedOperations: () => recorded,
    dispose,
  };
}

/**
 * Build a {@link SelectionContext} from a live DOM element. Reuses the
 * preview-engine's `data-vc-preview-id` attribute as the runtime id so the
 * reorder controller and resize controller share one element identity.
 */
export function buildSelectionContext(element: Element): SelectionContext {
  const domRect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const runtimeId = element.getAttribute(PREVIEW_ID_ATTR) ?? assignPreviewId(element);
  return {
    element,
    elementRef: { runtimeId, tagName: element.tagName.toLowerCase() },
    rect: { x: domRect.left, y: domRect.top, width: domRect.width, height: domRect.height },
    computedStyle: {
      display: style.display,
      flexDirection: style.flexDirection,
      position: style.position,
    },
  };
}

function assignPreviewId(element: Element): string {
  const id = `vc-interaction-${crypto.randomUUID()}`;
  element.setAttribute(PREVIEW_ID_ATTR, id);
  return id;
}
