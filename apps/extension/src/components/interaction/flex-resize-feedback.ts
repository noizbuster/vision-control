import type { FlexPairFeedbackState, ResizeHandlePosition } from "@vision-control/overlay-ui";
import { RESIZE_HANDLE_POSITIONS } from "@vision-control/overlay-ui";

import type { FlexResizeStatus } from "../../messaging/resize-messages.js";
import { prepareFlexPairResize } from "./flex-pair-resize-model.js";
import type { ResizeDiagnostic } from "./resize-gesture-coordinator.js";
import type { SelectedElementContext } from "./resize-selection-context.js";

export interface FlexResizeFeedback {
  readonly overlay: FlexPairFeedbackState;
  readonly status: FlexResizeStatus;
}

export function feedbackForFlexResizeSelection(
  context: SelectedElementContext,
): FlexResizeFeedback | null {
  const disabledHandles: ResizeHandlePosition[] = [];
  let pair: {
    readonly handle: ResizeHandlePosition;
    readonly neighborRect: typeof context.target.rect;
  } | null = null;
  let blockedMessage: string | null = null;
  let disabledMessage: string | null = null;

  for (const handle of RESIZE_HANDLE_POSITIONS) {
    const route = prepareFlexPairResize(context, handle);
    switch (route.kind) {
      case "pair":
        if (pair === null) {
          pair = { handle, neighborRect: route.prepared.neighbor.rect };
        }
        break;
      case "corner-disabled":
        disabledHandles.push(handle);
        disabledMessage ??= "Corner handles are disabled for paired Flex Resize";
        break;
      case "rejected":
        disabledHandles.push(handle);
        blockedMessage ??= route.diagnostic.message;
        break;
      case "not-flex":
      case "cross-axis":
        break;
      default: {
        const exhaustive: never = route;
        return exhaustive;
      }
    }
  }

  if (pair !== null) {
    return {
      overlay: {
        kind: "valid",
        anchorRect: context.target.rect,
        pairRect: pair.neighborRect,
        label: "Paired resize ready",
        disabledHandles,
      },
      status: { kind: "valid" },
    };
  }
  if (blockedMessage !== null) {
    return {
      overlay: {
        kind: "blocked",
        anchorRect: context.target.rect,
        pairRect: null,
        label: blockedMessage,
        disabledHandles,
      },
      status: { kind: "blocked", message: blockedMessage },
    };
  }
  if (disabledMessage !== null) {
    return {
      overlay: {
        kind: "disabled-edge",
        anchorRect: context.target.rect,
        pairRect: null,
        label: disabledMessage,
        disabledHandles,
      },
      status: { kind: "disabled-edge", message: disabledMessage },
    };
  }
  return null;
}

export function feedbackForFlexResizeHandle(
  context: SelectedElementContext,
  handle: ResizeHandlePosition,
): FlexResizeFeedback | null {
  const route = prepareFlexPairResize(context, handle);
  switch (route.kind) {
    case "pair": {
      const selection = feedbackForFlexResizeSelection(context);
      if (selection === null) return null;
      return {
        overlay: { ...selection.overlay, kind: "active", label: "Resizing paired items" },
        status: { kind: "active" },
      };
    }
    case "corner-disabled":
      return disabledEdgeFeedback(
        context,
        handle,
        "Corner handles are disabled for paired Flex Resize",
      );
    case "rejected":
      return blockedFeedback(context, handle, route.diagnostic.message);
    case "not-flex":
    case "cross-axis":
      return null;
    default: {
      const exhaustive: never = route;
      return exhaustive;
    }
  }
}

export function feedbackForResizeDiagnostic(
  context: SelectedElementContext,
  diagnostic: ResizeDiagnostic,
  handle: ResizeHandlePosition | null,
): FlexResizeFeedback | null {
  switch (diagnostic.kind) {
    case "invalid-resize-candidate":
      return null;
    case "flex-pair-disabled":
      return disabledEdgeFeedback(context, handle, diagnostic.message);
    case "flex-pair-rejected":
      return blockedFeedback(context, handle, diagnostic.message);
    default: {
      const exhaustive: never = diagnostic;
      return exhaustive;
    }
  }
}

function disabledEdgeFeedback(
  context: SelectedElementContext,
  handle: ResizeHandlePosition | null,
  message: string,
): FlexResizeFeedback {
  return {
    overlay: {
      kind: "disabled-edge",
      anchorRect: context.target.rect,
      pairRect: null,
      label: message,
      disabledHandles: handle === null ? [] : [handle],
    },
    status: { kind: "disabled-edge", message },
  };
}

function blockedFeedback(
  context: SelectedElementContext,
  handle: ResizeHandlePosition | null,
  message: string,
): FlexResizeFeedback {
  return {
    overlay: {
      kind: "blocked",
      anchorRect: context.target.rect,
      pairRect: null,
      label: message,
      disabledHandles: handle === null ? [] : [handle],
    },
    status: { kind: "blocked", message },
  };
}
