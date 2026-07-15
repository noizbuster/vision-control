import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

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

/**
 * In-memory chrome.storage.session stand-in for SW restart simulation.
 * Only the SessionJournalStore may write journal keys in production; tests
 * use this fake as the sole storage backend.
 */
function createMemorySessionStorage(): chrome.storage.StorageArea & {
  readonly writes: readonly string[];
  readonly data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>();
  const writes: string[] = [];
  return {
    get data() {
      return data;
    },
    get writes() {
      return writes;
    },
    get: async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys === null) {
        return Object.fromEntries(data.entries());
      }
      if (typeof keys === "string") {
        return keys in Object.fromEntries(data) || data.has(keys)
          ? { [keys]: data.get(keys) }
          : {};
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
        writes.push(key);
      }
    },
    remove: async (keys: string | string[]) => {
      const list = typeof keys === "string" ? [keys] : keys;
      for (const key of list) {
        data.delete(key);
      }
    },
  } as unknown as chrome.storage.StorageArea & {
    readonly writes: readonly string[];
    readonly data: Map<string, unknown>;
  };
}

describe("SessionJournalStore (C1 sole writer)", () => {
  it("writes only journal:v1:${tabId} session keys", async () => {
    const storage = createMemorySessionStorage();
    const store = new SessionJournalStore({ storage });
    const journal = journalWithOp("op-store-001");

    await store.set(42, journal);

    expect(storage.data.has(journalStorageKey(42))).toBe(true);
    expect(storage.writes).toEqual([journalStorageKey(42)]);
    expect(store.get(42).entries).toHaveLength(1);
  });

  it("restores the same journal after SW restart simulation", async () => {
    const storage = createMemorySessionStorage();
    const first = new SessionJournalStore({ storage });
    const journal = journalWithOp("op-sw-restart");
    await first.set(7, journal);

    // Simulate MV3 service-worker kill: new store instance, same session storage.
    const second = new SessionJournalStore({ storage });
    expect(second.has(7)).toBe(false);

    await second.restore();

    expect(second.has(7)).toBe(true);
    expect(second.get(7).entries).toHaveLength(1);
    expect(second.get(7).entries[0]?.operation.id).toBe("op-sw-restart");
    expect(second.get(7).stacks.undo).toEqual(journal.stacks.undo);
  });

  it("isolates journals across tabs", async () => {
    const storage = createMemorySessionStorage();
    const store = new SessionJournalStore({ storage });
    await store.set(1, journalWithOp("op-tab-a"));
    await store.set(2, journalWithOp("op-tab-b"));

    expect(store.get(1).entries[0]?.operation.id).toBe("op-tab-a");
    expect(store.get(2).entries[0]?.operation.id).toBe("op-tab-b");
    expect(storage.data.has(journalStorageKey(1))).toBe(true);
    expect(storage.data.has(journalStorageKey(2))).toBe(true);

    const rehydrated = new SessionJournalStore({ storage });
    await rehydrated.restore();
    expect(rehydrated.get(1).entries[0]?.operation.id).toBe("op-tab-a");
    expect(rehydrated.get(2).entries[0]?.operation.id).toBe("op-tab-b");
  });

  it("clears the session key on tab remove", async () => {
    const storage = createMemorySessionStorage();
    const store = new SessionJournalStore({ storage });
    await store.set(99, journalWithOp("op-remove"));
    expect(storage.data.has(journalStorageKey(99))).toBe(true);

    await store.remove(99);

    expect(store.has(99)).toBe(false);
    expect(storage.data.has(journalStorageKey(99))).toBe(false);
    expect(store.get(99).entries).toHaveLength(0);

    const rehydrated = new SessionJournalStore({ storage });
    await rehydrated.restore();
    expect(rehydrated.has(99)).toBe(false);
  });

  it("ignores non-journal session keys on restore", async () => {
    const storage = createMemorySessionStorage();
    await storage.set({ visionControlSessions: { "1": { sessionId: "x" } } });
    await storage.set({ [journalStorageKey(3)]: "not-valid-json" });
    const store = new SessionJournalStore({ storage });
    await store.restore();
    expect(store.tabIds()).toEqual([]);
  });
});
