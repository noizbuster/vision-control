import type { BusMessage, ConnectionState, TabSession } from "./types.js";

export function createSessionUpdateMessage(tabId: number, session: TabSession): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `session-${tabId}-${Date.now()}`,
    messageType: "session-update",
    targetRoute: "panel",
    payload: { tabId, session },
    timestamp: Date.now(),
  };
}

export function createConnectionStateMessage(state: ConnectionState): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `connection-state-${Date.now()}`,
    messageType: "connection-state",
    targetRoute: "panel",
    payload: { state },
    timestamp: Date.now(),
  };
}
