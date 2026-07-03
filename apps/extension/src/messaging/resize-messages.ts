import type { ResizeElementOperation } from "@vision-control/change-ir";
import type { ResizeCandidateSet, ResizePropertyKind } from "@vision-control/layout-engine";

import type { BusMessage } from "./types.js";

export type ResizeCandidatesPayload = ResizeCandidateSet;

export interface ResizeCandidateSelectPayload {
  readonly property: ResizePropertyKind;
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

export function createResizeCandidateSelectMessage(property: ResizePropertyKind): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `resize-candidate-select-${Date.now()}`,
    messageType: "resize-candidate-select",
    targetRoute: "content",
    payload: { property } satisfies ResizeCandidateSelectPayload,
    timestamp: Date.now(),
  };
}

export function createResizeOperationMessage(operation: ResizeElementOperation): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `resize-operation-${Date.now()}`,
    messageType: "resize-operation",
    targetRoute: "background",
    payload: operation,
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
  return (
    typeof payload === "object" &&
    payload !== null &&
    "property" in payload &&
    typeof (payload as { property?: unknown }).property === "string"
  );
}
