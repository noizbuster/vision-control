import type { Operation } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";

import type { BusMessage, ConnectionState, TabSession } from "./types.js";

export function createSelectionSummaryMessage(summary: SelectionSummary): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `selection-summary-${Date.now()}`,
    messageType: "selection-summary",
    targetRoute: "panel",
    payload: summary,
    timestamp: Date.now(),
  };
}

export function createSelectElementMessage(selector: string): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `select-element-${Date.now()}`,
    messageType: "select-element",
    targetRoute: "background",
    payload: { selector },
    timestamp: Date.now(),
  };
}

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

export function createEditorCommandMessage(operation: Operation): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `editor-command-${Date.now()}`,
    messageType: "editor-command",
    targetRoute: "background",
    payload: operation,
    timestamp: Date.now(),
  };
}
