import { createOperationId, type ResizeElementOperation } from "@vision-control/change-ir";
import type { ElementRef } from "@vision-control/element-identity";
import type { Point, Rect } from "@vision-control/geometry";
import {
  createPointerId,
  createResizeOperation,
  type ResizeAxis,
  type ResizeModifiers,
  type ResizeOperation,
  type ResizeTarget,
} from "@vision-control/interaction-machine";
import {
  classifyAndGenerateResizeCandidates,
  type LayoutComputedStyle,
  type ResizeCandidate,
  type ResizeCandidateSet,
  type ResizePropertyKind,
} from "@vision-control/layout-engine";
import type { OverlayElement, ResizeHandlePosition } from "@vision-control/overlay-ui";
import type { PreviewManager } from "@vision-control/preview-engine";

import type { BusMessage, MessageBus } from "../../messaging/index.js";
import {
  createResizeCandidatesMessage,
  createResizeOperationMessage,
  isResizeCandidateSelectPayload,
} from "../../messaging/resize-messages.js";

/**
 * Narrow bus seam. {@link MessageBus} satisfies this structurally; tests and
 * the overlay runtime may pass a smaller fake carrying only `send` + `on`.
 */
export interface ResizeControllerBus {
  readonly send: MessageBus["send"];
  readonly on: MessageBus["on"];
}

export interface SelectedElementContext {
  readonly element: ElementRef;
  readonly rect: Rect;
  readonly computedStyle: LayoutComputedStyle;
}

export interface ResizeControllerOptions {
  readonly overlayElement: OverlayElement;
  readonly previewEngine: PreviewManager;
  readonly bus: ResizeControllerBus;
  /**
   * Invoked with the committed resize operation alongside the bus emission.
   * The overlay runtime funnels this into the change journal; the bus path
   * coordinates with the background.
   */
  readonly onRecordOperation?: (operation: ResizeElementOperation) => void;
}

interface ActiveGesture {
  readonly operation: ResizeOperation;
  readonly target: ResizeTarget;
  readonly handle: ResizeHandlePosition;
  readonly startPointer: Point;
  readonly pointerId: number;
  previewRollback: (() => void) | null;
}

const PROPERTY_TO_AXIS: Record<ResizePropertyKind, ResizeAxis> = {
  width: "x",
  height: "y",
  "flex-basis": "x",
  "flex-grow": "x",
  "flex-shrink": "x",
  "min-width": "x",
  "max-width": "x",
  "min-height": "y",
  "max-height": "y",
  "aspect-ratio": "x",
  "align-self": "y",
};

/**
 * First css-property candidate in a set, or null. The drag controller only
 * drives pixel-resizable CSS properties; grid-span / intrinsic / tailwind /
 * design-token candidates are surfaced to the panel but resolved by other
 * controllers (not the pixel-drag path).
 */
const firstCssProperty = (candidates: readonly ResizeCandidate[]): ResizePropertyKind | null => {
  for (const candidate of candidates) {
    if (candidate.kind === "css-property") return candidate.property;
  }
  return null;
};

/**
 * Properties whose value is a keyword or ratio, not a pixel length. The
 * pixel-drag math does not apply; they are generated candidates but skipped by
 * the drag handle.
 */
const isPixelDragResizable = (property: ResizePropertyKind): boolean =>
  property !== "aspect-ratio" && property !== "align-self";

const propertyUnit = (property: ResizePropertyKind): string => {
  if (property === "flex-grow" || property === "flex-shrink") return "";
  if (property === "aspect-ratio") return "";
  if (property === "align-self") return "";
  return "px";
};

export function createResizeController(options: ResizeControllerOptions): {
  readonly attach: (context: SelectedElementContext) => void;
  readonly detach: () => void;
  readonly destroy: () => void;
} {
  const { overlayElement, previewEngine, bus, onRecordOperation } = options;

  let attachedContext: SelectedElementContext | null = null;
  let candidateSet: ResizeCandidateSet | null = null;
  let selectedProperty: ResizePropertyKind | null = null;
  let gesture: ActiveGesture | null = null;
  let rafId: number | null = null;
  let latestPointer: {
    readonly x: number;
    readonly y: number;
    readonly modifiers: ResizeModifiers;
  } | null = null;
  let unselectCandidate: (() => void) | null = null;

  const cleanupPreview = (): void => {
    if (gesture !== null && gesture.previewRollback !== null) {
      gesture.previewRollback();
      gesture.previewRollback = null;
    }
  };

  const cancelRaf = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const readModifiers = (event: PointerEvent): ResizeModifiers => ({
    shift: event.shiftKey,
    alt: event.altKey,
  });

  const buildPreviewOperation = (target: ResizeTarget, value: number): ResizeElementOperation => ({
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

  const applyPreview = (): void => {
    if (gesture === null || latestPointer === null) return;

    const delta: Point = {
      x: latestPointer.x - gesture.startPointer.x,
      y: latestPointer.y - gesture.startPointer.y,
    };

    const preview = gesture.operation.updateResize(delta.x, delta.y, latestPointer.modifiers);
    if (preview === null) return;

    cleanupPreview();
    const operation = buildPreviewOperation(gesture.target, preview.value);
    gesture.previewRollback = previewEngine.applyOperation(operation);
  };

  const schedulePreview = (): void => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      applyPreview();
    });
  };

  const endGesture = (): void => {
    cancelRaf();
    if (gesture === null) return;

    cleanupPreview();
    const result = gesture.operation.endResize();
    if (result !== null) {
      onRecordOperation?.(result.operation);
      bus.send("background", createResizeOperationMessage(result.operation));
    }

    const handleElement = overlayElement.getResizeHandle(gesture.handle);
    if (handleElement !== null) {
      handleElement.releasePointerCapture(gesture.pointerId);
    }

    gesture = null;
    latestPointer = null;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (gesture === null || event.pointerId !== gesture.pointerId) return;
    latestPointer = {
      x: event.clientX,
      y: event.clientY,
      modifiers: readModifiers(event),
    };
    schedulePreview();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (gesture === null || event.pointerId !== gesture.pointerId) return;
    endGesture();
  };

  const onPointerDown =
    (handle: ResizeHandlePosition) =>
    (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      if (attachedContext === null || candidateSet === null || !candidateSet.supported) return;

      const property = selectedProperty ?? firstCssProperty(candidateSet.candidates);
      if (property === null || !isPixelDragResizable(property)) return;

      const handleElement = event.currentTarget as HTMLElement;
      handleElement.setPointerCapture(event.pointerId);

      const target: ResizeTarget = {
        element: attachedContext.element,
        property,
        axis: PROPERTY_TO_AXIS[property] ?? "x",
        fromValue: parseCssPixel(attachedContext.computedStyle, property),
        unit: propertyUnit(property),
        rect: attachedContext.rect,
      };

      const operation = createResizeOperation();
      operation.beginResize(handle, createPointerId(String(event.pointerId)), target);

      gesture = {
        operation,
        target,
        handle,
        startPointer: { x: event.clientX, y: event.clientY },
        pointerId: event.pointerId,
        previewRollback: null,
      };
      latestPointer = {
        x: event.clientX,
        y: event.clientY,
        modifiers: readModifiers(event),
      };
    };

  const attachHandleListeners = (): void => {
    for (const position of ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as ResizeHandlePosition[]) {
      const handle = overlayElement.getResizeHandle(position);
      if (handle === null) continue;
      handle.addEventListener("pointerdown", onPointerDown(position));
      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
    }
  };

  const detachHandleListeners = (): void => {
    for (const position of ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as ResizeHandlePosition[]) {
      const handle = overlayElement.getResizeHandle(position);
      if (handle === null) continue;
      handle.removeEventListener("pointerdown", onPointerDown(position));
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
    }
  };

  const attach = (context: SelectedElementContext): void => {
    detach();
    attachedContext = context;
    candidateSet = classifyAndGenerateResizeCandidates(context.element, context.computedStyle);

    bus.send("background", createResizeCandidatesMessage(candidateSet));

    if (candidateSet.supported) {
      selectedProperty = firstCssProperty(candidateSet.candidates);
      overlayElement.setResizeHandles(context.rect);
      attachHandleListeners();
    }
  };

  const detach = (): void => {
    if (gesture !== null) {
      endGesture();
    }
    cleanupPreview();
    overlayElement.setResizeHandles(null);
    detachHandleListeners();
    attachedContext = null;
    candidateSet = null;
    selectedProperty = null;
  };

  const destroy = (): void => {
    detach();
    if (unselectCandidate !== null) {
      unselectCandidate();
    }
  };

  unselectCandidate = bus.on("resize-candidate-select", (message: BusMessage) => {
    const payload = message.payload as unknown;
    if (isResizeCandidateSelectPayload(payload)) {
      if (payload.kind === "css-property" && payload.property !== undefined) {
        selectedProperty = payload.property;
      }
    }
  });

  return { attach, detach, destroy };
}

function parseCssPixel(_computedStyle: LayoutComputedStyle, property: ResizePropertyKind): number {
  // MVP: every resizable property is previewed in pixels regardless of its
  // authored unit. A production implementation would read the declared value
  // from inline style or matched rules.
  const pxPerUnit: Record<ResizePropertyKind, number> = {
    width: 100,
    height: 50,
    "flex-basis": 100,
    "flex-grow": 0,
    "flex-shrink": 1,
    "min-width": 0,
    "max-width": 9999,
    "min-height": 0,
    "max-height": 9999,
    "aspect-ratio": 1,
    "align-self": 0,
  };
  return pxPerUnit[property] ?? 0;
}
