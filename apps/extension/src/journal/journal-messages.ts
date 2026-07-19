import { type Journal, JournalSchema } from "@vision-control/change-journal";

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
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("tabId" in payload) ||
    !("journal" in payload) ||
    typeof payload.tabId !== "number"
  ) {
    return null;
  }
  if (payload.journal === null) {
    return { tabId: payload.tabId, journal: null };
  }
  const parsed = JournalSchema.safeParse(payload.journal);
  if (!parsed.success) {
    return null;
  }
  return { tabId: payload.tabId, journal: parsed.data };
}
