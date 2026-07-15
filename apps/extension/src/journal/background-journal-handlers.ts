/**
 * Background bus handlers for C1 session journal ownership.
 * Background is the sole writer; panel/content only send bus mutations.
 */

import {
  createJournal,
  deserializeJournal,
  type Journal,
  JournalSchema,
} from "@vision-control/change-journal";

import type { MessageBus } from "../messaging/bus.js";
import type { BusMessage, MessageContext } from "../messaging/types.js";
import {
  createJournalStateMessage,
  JOURNAL_REPLACE_TYPE,
  JOURNAL_REQUEST_TYPE,
} from "./journal-messages.js";
import type { SessionJournalStore } from "./session-journal-store.js";

export interface BackgroundJournalHandlersOptions {
  readonly store: SessionJournalStore;
  readonly bus: MessageBus;
  /** Deliver journal-state to panel (runtime broadcast). */
  readonly broadcastToPanel: (message: BusMessage) => void;
  /** Deliver journal-state to content frames of a tab. */
  readonly sendToTabContent: (tabId: number, message: BusMessage) => void;
  /** After SoT write (journal-replace). Used for MCP snapshot projection. */
  readonly onJournalChanged?: (tabId: number, journal: Journal) => void;
}

export interface BackgroundJournalHandlers {
  readonly handleTabRemoved: (tabId: number) => void;
  readonly dispose: () => void;
}

function parseJournalPayload(payload: unknown): Journal | null {
  const result = JournalSchema.safeParse(payload);
  if (result.success) {
    return result.data;
  }
  if (typeof payload === "string") {
    const deserialized = deserializeJournal(payload);
    return deserialized.success ? deserialized.data : null;
  }
  return null;
}

function resolveTabId(message: BusMessage, sender: MessageContext): number | undefined {
  return message.tabId ?? sender.tabId;
}

export function installBackgroundJournalHandlers(
  options: BackgroundJournalHandlersOptions,
): BackgroundJournalHandlers {
  const { store, bus, broadcastToPanel, sendToTabContent, onJournalChanged } = options;

  const publishState = (tabId: number, journal: Journal | null): void => {
    broadcastToPanel(createJournalStateMessage(tabId, journal, "panel"));
    sendToTabContent(tabId, createJournalStateMessage(tabId, journal, "content"));
  };

  const unsubReplace = bus.on(JOURNAL_REPLACE_TYPE, (message, sender) => {
    const tabId = resolveTabId(message, sender);
    if (tabId === undefined) {
      return;
    }
    const journal = parseJournalPayload(message.payload);
    if (journal === null) {
      return;
    }
    void store.set(tabId, journal).then(() => {
      publishState(tabId, journal);
      onJournalChanged?.(tabId, journal);
    });
  });

  const unsubRequest = bus.on(JOURNAL_REQUEST_TYPE, (message, sender) => {
    const tabId = resolveTabId(message, sender);
    if (tabId === undefined) {
      return;
    }
    const journal = store.has(tabId) ? store.get(tabId) : null;
    publishState(tabId, journal);
  });

  const handleTabRemoved = (tabId: number): void => {
    void store.remove(tabId);
  };

  return {
    handleTabRemoved,
    dispose: () => {
      unsubReplace();
      unsubRequest();
    },
  };
}

export { createJournal };
