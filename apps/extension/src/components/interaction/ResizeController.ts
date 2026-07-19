import type { Operation } from "@vision-control/change-ir";
import type {
  ResizeCandidate,
  ResizeCandidateSet,
  ResizePropertyKind,
} from "@vision-control/layout-engine";
import { classifyAndGenerateResizeCandidates } from "@vision-control/layout-engine";
import type { OverlayElement, ResizeHandlePosition } from "@vision-control/overlay-ui";
import type { PreviewManager } from "@vision-control/preview-engine";

import type { BusMessage, MessageBus } from "../../messaging/index.js";
import type { FlexResizeStatus } from "../../messaging/resize-messages.js";
import {
  createResizeCandidatesMessage,
  isResizeCandidateSelectPayload,
} from "../../messaging/resize-messages.js";
import {
  type FlexResizeFeedback,
  feedbackForFlexResizeHandle,
  feedbackForFlexResizeSelection,
  feedbackForResizeDiagnostic,
} from "./flex-resize-feedback.js";
import {
  createResizeGestureCoordinator,
  type ResizeDiagnostic,
} from "./resize-gesture-coordinator.js";
import type { SelectedElementContext } from "./resize-selection-context.js";

export type { ResizeDiagnostic } from "./resize-gesture-coordinator.js";
export type { SelectedElementContext } from "./resize-selection-context.js";

export interface ResizeControllerBus {
  readonly send: MessageBus["send"];
  readonly on: MessageBus["on"];
}

export interface ResizeControllerOptions {
  readonly overlayElement: OverlayElement;
  readonly previewEngine: PreviewManager;
  readonly bus: ResizeControllerBus;
  readonly onRecordOperation?: (operation: Operation) => void;
  readonly onDiagnostic?: (diagnostic: ResizeDiagnostic) => void;
  readonly onStatus?: (status: FlexResizeStatus | null) => void;
}

export interface ResizeController {
  readonly attach: (context: SelectedElementContext) => void;
  readonly detach: () => void;
  readonly destroy: () => void;
}

interface HandleListeners {
  readonly element: HTMLElement;
  readonly pointerDown: (event: PointerEvent) => void;
  readonly pointerMove: (event: PointerEvent) => void;
  readonly pointerUp: (event: PointerEvent) => void;
  readonly pointerCancel: (event: PointerEvent) => void;
  readonly lostPointerCapture: (event: PointerEvent) => void;
}

const RESIZE_HANDLES = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
] as const satisfies readonly ResizeHandlePosition[];

const firstCssProperty = (candidates: readonly ResizeCandidate[]): ResizePropertyKind | null => {
  for (const candidate of candidates) {
    if (candidate.kind === "css-property") return candidate.property;
  }
  return null;
};

export function createResizeController(options: ResizeControllerOptions): ResizeController {
  const { overlayElement, previewEngine, bus, onRecordOperation, onDiagnostic, onStatus } = options;
  let attachedContext: SelectedElementContext | null = null;
  let candidateSet: ResizeCandidateSet | null = null;
  let selectedProperty: ResizePropertyKind | null = null;
  let handleListeners: readonly HandleListeners[] = [];
  let shouldRestoreSelectionFeedback = true;

  const publishFeedback = (feedback: FlexResizeFeedback | null): void => {
    overlayElement.setFlexPairFeedback(feedback?.overlay ?? null);
    onStatus?.(feedback?.status ?? null);
  };

  const publishSelectionFeedback = (): void => {
    publishFeedback(
      attachedContext === null ? null : feedbackForFlexResizeSelection(attachedContext),
    );
  };

  const gesture = createResizeGestureCoordinator({
    previewEngine,
    onCommit: (operation) => {
      onRecordOperation?.(operation);
    },
    onDiagnostic: (diagnostic, handle) => {
      shouldRestoreSelectionFeedback = false;
      if (attachedContext !== null) {
        publishFeedback(feedbackForResizeDiagnostic(attachedContext, diagnostic, handle));
      }
      onDiagnostic?.(diagnostic);
    },
  });

  const detachHandleListeners = (): void => {
    for (const listener of handleListeners) {
      listener.element.removeEventListener("pointerdown", listener.pointerDown);
      listener.element.removeEventListener("pointermove", listener.pointerMove);
      listener.element.removeEventListener("pointerup", listener.pointerUp);
      listener.element.removeEventListener("pointercancel", listener.pointerCancel);
      listener.element.removeEventListener("lostpointercapture", listener.lostPointerCapture);
    }
    handleListeners = [];
  };

  const attachHandleListeners = (): void => {
    const listeners: HandleListeners[] = [];
    for (const position of RESIZE_HANDLES) {
      const element = overlayElement.getResizeHandle(position);
      if (element === null) continue;
      const pointerDown = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (attachedContext === null || candidateSet === null || !candidateSet.supported) return;
        shouldRestoreSelectionFeedback = true;
        publishFeedback(feedbackForFlexResizeHandle(attachedContext, position));
        const property = selectedProperty ?? firstCssProperty(candidateSet.candidates);
        gesture.begin({
          context: attachedContext,
          handleElement: element,
          handle: position,
          event,
          selectedProperty: property,
        });
      };
      const pointerMove = (event: PointerEvent): void => gesture.move(event);
      const pointerUp = (event: PointerEvent): void => {
        gesture.end(event);
        if (shouldRestoreSelectionFeedback) publishSelectionFeedback();
      };
      const pointerCancel = (event: PointerEvent): void => {
        gesture.cancel(event);
        if (shouldRestoreSelectionFeedback) publishSelectionFeedback();
      };
      const lostPointerCapture = (event: PointerEvent): void => {
        gesture.lostCapture(event);
        if (shouldRestoreSelectionFeedback) publishSelectionFeedback();
      };
      element.addEventListener("pointerdown", pointerDown);
      element.addEventListener("pointermove", pointerMove);
      element.addEventListener("pointerup", pointerUp);
      element.addEventListener("pointercancel", pointerCancel);
      element.addEventListener("lostpointercapture", lostPointerCapture);
      listeners.push({
        element,
        pointerDown,
        pointerMove,
        pointerUp,
        pointerCancel,
        lostPointerCapture,
      });
    }
    handleListeners = listeners;
  };

  const detach = (): void => {
    gesture.cancelActive();
    detachHandleListeners();
    publishFeedback(null);
    overlayElement.setResizeHandles(null);
    attachedContext = null;
    candidateSet = null;
    selectedProperty = null;
  };

  const attach = (context: SelectedElementContext): void => {
    detach();
    attachedContext = context;
    candidateSet = classifyAndGenerateResizeCandidates(
      context.target.ref,
      context.layoutComputedStyle,
    );
    bus.send("background", createResizeCandidatesMessage(candidateSet));
    if (!candidateSet.supported) {
      overlayElement.setResizeHandles(context.target.rect);
      publishSelectionFeedback();
      return;
    }
    selectedProperty = firstCssProperty(candidateSet.candidates);
    overlayElement.setResizeHandles(context.target.rect);
    attachHandleListeners();
    publishSelectionFeedback();
  };

  const unselectCandidate = bus.on("resize-candidate-select", (message: BusMessage) => {
    if (!isResizeCandidateSelectPayload(message.payload)) {
      onDiagnostic?.({
        kind: "invalid-resize-candidate",
        message: "resize candidate selection payload is malformed or unsupported",
      });
      return;
    }
    if (message.payload.kind === "css-property" && message.payload.property !== undefined) {
      selectedProperty = message.payload.property;
    }
  });

  const destroy = (): void => {
    detach();
    unselectCandidate();
  };

  return { attach, detach, destroy };
}
