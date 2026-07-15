import type { Journal } from "@vision-control/change-journal";

import type { BusMessage, BusRoute } from "../messaging/types.js";

export const JOURNAL_REPLACE_TYPE = "journal-replace" as const;
export const JOURNAL_REQUEST_TYPE = "journal-request" as const;
export const JOURNAL_STATE_TYPE = "journal-state" as const;

export interface JournalStatePayload {
  readonly tabId: number;
  readonly journal: Journal | null;
}

export function createJournalReplaceMessage(
  tabId: number | undefined,
  journal: Journal,
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `journal-replace-${tabId ?? "tab"}-${Date.now()}`,
    messageType: JOURNAL_REPLACE_TYPE,
    targetRoute: "background",
    ...(tabId !== undefined ? { tabId } : {}),
    payload: journal,
    timestamp: Date.now(),
  };
}

export function createJournalRequestMessage(tabId?: number): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `journal-request-${Date.now()}`,
    messageType: JOURNAL_REQUEST_TYPE,
    targetRoute: "background",
    ...(tabId !== undefined ? { tabId } : {}),
    payload: null,
    timestamp: Date.now(),
  };
}

export function createJournalStateMessage(
  tabId: number,
  journal: Journal | null,
  targetRoute: BusRoute = "panel",
): BusMessage {
  const payload: JournalStatePayload = { tabId, journal };
  return {
    protocolVersion: "1.0.0",
    messageId: `journal-state-${tabId}-${Date.now()}`,
    messageType: JOURNAL_STATE_TYPE,
    targetRoute,
    tabId,
    payload,
    timestamp: Date.now(),
  };
}

export function parseJournalStatePayload(payload: unknown): JournalStatePayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  if (typeof obj.tabId !== "number") {
    return null;
  }
  if (obj.journal !== null && (typeof obj.journal !== "object" || obj.journal === null)) {
    return null;
  }
  return {
    tabId: obj.tabId,
    journal: obj.journal as Journal | null,
  };
}
