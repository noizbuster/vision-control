import type {
  ResizeCandidateKind,
  ResizeCandidateSet,
  ResizePropertyKind,
} from "@vision-control/layout-engine";

import type { BusMessage } from "./types.js";

export type ResizeCandidatesPayload = ResizeCandidateSet;

export type FlexResizeStatus =
  | { readonly kind: "valid" }
  | { readonly kind: "active" }
  | { readonly kind: "disabled-edge"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string };

/**
 * Selection payload for a resize candidate. `kind` identifies which of the PRD
 * section 9.5 candidate kinds the user picked; `property` is carried only for
 * `css-property` selections (the pixel-drag controller consumes those).
 */
export interface ResizeCandidateSelectPayload {
  readonly kind: ResizeCandidateKind;
  readonly property?: ResizePropertyKind;
}

export function createResizeCandidatesMessage(candidates: ResizeCandidateSet): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `resize-candidates-${Date.now()}`,
    messageType: "resize-candidates",
    targetRoute: "panel",
    payload: candidates,
    timestamp: Date.now(),
  };
}

export function createResizeCandidateSelectMessage(
  kind: ResizeCandidateKind,
  property?: ResizePropertyKind,
): BusMessage {
  const payload: ResizeCandidateSelectPayload =
    property === undefined ? { kind } : { kind, property };
  return {
    protocolVersion: "1.0.0",
    messageId: `resize-candidate-select-${Date.now()}`,
    messageType: "resize-candidate-select",
    targetRoute: "content",
    payload,
    timestamp: Date.now(),
  };
}

export function createFlexResizeStatusMessage(status: FlexResizeStatus | null): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `flex-resize-status-${Date.now()}`,
    messageType: "flex-resize-status",
    targetRoute: "panel",
    payload: status,
    timestamp: Date.now(),
  };
}

export function isResizeCandidateSet(payload: unknown): payload is ResizeCandidateSet {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "supported" in payload &&
    typeof (payload as { supported?: unknown }).supported === "boolean"
  );
}

export function isResizeCandidateSelectPayload(
  payload: unknown,
): payload is ResizeCandidateSelectPayload {
  if (typeof payload !== "object" || payload === null || !("kind" in payload)) return false;
  const kind = payload.kind;
  if (
    kind !== "css-property" &&
    kind !== "grid-span" &&
    kind !== "intrinsic" &&
    kind !== "tailwind-class" &&
    kind !== "design-token"
  ) {
    return false;
  }
  const property = "property" in payload ? payload.property : undefined;
  if (kind !== "css-property") return property === undefined;
  return (
    property === "width" ||
    property === "height" ||
    property === "flex-basis" ||
    property === "flex-grow" ||
    property === "flex-shrink" ||
    property === "min-width" ||
    property === "max-width" ||
    property === "min-height" ||
    property === "max-height" ||
    property === "aspect-ratio" ||
    property === "align-self"
  );
}

export function isFlexResizeStatus(payload: unknown): payload is FlexResizeStatus | null {
  if (payload === null) return true;
  if (typeof payload !== "object" || payload === null || !("kind" in payload)) return false;

  switch (payload.kind) {
    case "valid":
    case "active":
      return true;
    case "disabled-edge":
    case "blocked":
      return "message" in payload && typeof payload.message === "string";
    default:
      return false;
  }
}
