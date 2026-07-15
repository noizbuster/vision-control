import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import { describe, expect, it, vi } from "vitest";

import type { MessageBus } from "../messaging/bus.js";
import type { BusMessage, MessageContext } from "../messaging/types.js";
import { installBackgroundJournalHandlers } from "./background-journal-handlers.js";
import {
  createJournalReplaceMessage,
  createJournalRequestMessage,
  JOURNAL_STATE_TYPE,
} from "./journal-messages.js";
import { journalStorageKey } from "./session-journal-keys.js";
import { SessionJournalStore } from "./session-journal-store.js";

const BASE_TIME = 1_700_000_000_000;

function styleEdit(id: string): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "style-edit",
    target: { runtimeId: "btn-1" },
    property: "color",
    value: "blue",
    important: false,
    previousValue: "red",
  };
}

function journalWithOp(opId: string): Journal {
  const entry = createJournalEntry({
    id: `je-${opId}`,
    changeSetId: "csjournal001",
    transactionId: "tx-journal-001",
    sequence: 0,
    operation: styleEdit(opId),
    status: "committed",
  });
  return appendEntry(createJournal(), entry);
}

function createMemorySessionStorage(): chrome.storage.StorageArea & {
  readonly data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>();
  return {
    get data() {
      return data;
    },
    get: async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) {
        return Object.fromEntries(data.entries());
      }
      if (typeof keys === "string") {
        return data.has(keys) ? { [keys]: data.get(keys) } : {};
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (data.has(key)) out[key] = data.get(key);
        }
        return out;
      }
      const out: Record<string, unknown> = { ...keys };
      for (const key of Object.keys(keys)) {
        if (data.has(key)) out[key] = data.get(key);
      }
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value);
      }
    },
    remove: async (keys: string | string[]) => {
      const list = typeof keys === "string" ? [keys] : keys;
      for (const key of list) {
        data.delete(key);
      }
    },
  } as unknown as chrome.storage.StorageArea & { readonly data: Map<string, unknown> };
}

function createFakeBus(): MessageBus & {
  readonly emit: (type: string, message: BusMessage, sender?: MessageContext) => void;
} {
  const handlers = new Map<string, Set<(message: BusMessage, sender: MessageContext) => void>>();
  return {
    getRoute: () => "background" as const,
    send: () => {},
    on: (type: string, handler: (message: BusMessage, sender: MessageContext) => void) => {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
      return () => set.delete(handler);
    },
    dispose: () => handlers.clear(),
    emit: (
      type: string,
      message: BusMessage,
      sender: MessageContext = { route: "panel", tabId: message.tabId },
    ) => {
      for (const handler of handlers.get(type) ?? []) {
        handler(message, sender);
      }
    },
  } as unknown as MessageBus & {
    readonly emit: (type: string, message: BusMessage, sender?: MessageContext) => void;
  };
}

describe("background journal handlers (C1 bus mutations)", () => {
  it("applies journal-replace from panel and is the sole storage writer", async () => {
    const storage = createMemorySessionStorage();
    const store = new SessionJournalStore({ storage });
    const bus = createFakeBus();
    const panelMessages: BusMessage[] = [];
    const contentMessages: BusMessage[] = [];

    installBackgroundJournalHandlers({
      store,
      bus,
      broadcastToPanel: (message) => panelMessages.push(message),
      sendToTabContent: (_tabId, message) => contentMessages.push(message),
    });

    const journal = journalWithOp("op-bus-replace");
    bus.emit("journal-replace", createJournalReplaceMessage(11, journal), {
      route: "panel",
      tabId: 11,
    });

    await vi.waitFor(() => {
      expect(store.has(11)).toBe(true);
      expect(panelMessages.some((m) => m.messageType === JOURNAL_STATE_TYPE)).toBe(true);
    });

    expect(storage.data.has(journalStorageKey(11))).toBe(true);
    expect(contentMessages.some((m) => m.messageType === JOURNAL_STATE_TYPE)).toBe(true);
  });

  it("rehydrates on journal-request after SW restore", async () => {
    const storage = createMemorySessionStorage();
    const writer = new SessionJournalStore({ storage });
    await writer.set(5, journalWithOp("op-rehydrate"));

    const store = new SessionJournalStore({ storage });
    await store.restore();

    const bus = createFakeBus();
    const panelMessages: BusMessage[] = [];
    installBackgroundJournalHandlers({
      store,
      bus,
      broadcastToPanel: (message) => panelMessages.push(message),
      sendToTabContent: () => {},
    });

    bus.emit("journal-request", createJournalRequestMessage(5), {
      route: "panel",
      tabId: 5,
    });

    const state = panelMessages.find((m) => m.messageType === JOURNAL_STATE_TYPE);
    expect(state).toBeDefined();
    const payload = state?.payload as { tabId: number; journal: Journal | null };
    expect(payload.tabId).toBe(5);
    expect(payload.journal?.entries[0]?.operation.id).toBe("op-rehydrate");
  });

  it("clears storage when tab is removed", async () => {
    const storage = createMemorySessionStorage();
    const store = new SessionJournalStore({ storage });
    await store.set(22, journalWithOp("op-tab-gone"));
    const bus = createFakeBus();
    const handlers = installBackgroundJournalHandlers({
      store,
      bus,
      broadcastToPanel: () => {},
      sendToTabContent: () => {},
    });

    handlers.handleTabRemoved(22);
    await vi.waitFor(() => {
      expect(storage.data.has(journalStorageKey(22))).toBe(false);
    });
    expect(store.has(22)).toBe(false);
  });

  it("does not let content dual-write: only store.set touches session keys", async () => {
    const storage = createMemorySessionStorage();
    const store = new SessionJournalStore({ storage });
    const bus = createFakeBus();
    installBackgroundJournalHandlers({
      store,
      bus,
      broadcastToPanel: () => {},
      sendToTabContent: () => {},
    });

    // Content sends mutation via bus (not storage).
    bus.emit("journal-replace", createJournalReplaceMessage(3, journalWithOp("op-from-content")), {
      route: "content",
      tabId: 3,
    });

    await vi.waitFor(() => {
      expect(store.get(3).entries[0]?.operation.id).toBe("op-from-content");
    });
    // Only the background store wrote the key.
    expect([...storage.data.keys()]).toEqual([journalStorageKey(3)]);
  });
});
