import type { BusMessage } from "./types.js";

export interface MoveRejectionStatus {
  readonly message: string;
}

export function createMoveRejectionStatusMessage(status: MoveRejectionStatus | null): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `move-rejection-status-${Date.now()}`,
    messageType: "move-rejection-status",
    targetRoute: "panel",
    payload: status,
    timestamp: Date.now(),
  };
}

export function isMoveRejectionStatus(payload: unknown): payload is MoveRejectionStatus | null {
  return (
    payload === null ||
    (typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string")
  );
}
