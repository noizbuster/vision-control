import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  deserializeJournal,
  type Journal,
  serializeJournal,
} from "@vision-control/change-journal";
import { describe, expect, it } from "vitest";

import { type BusTransport, MessageBus } from "../messaging/bus.js";
import type { BusMessage, MessageContext } from "../messaging/types.js";
import { installBackgroundJournalHandlers } from "./background-journal-handlers.js";
import {
  createJournalReplaceMessage,
  createJournalRequestMessage,
  parseJournalStatePayload,
} from "./journal-messages.js";
import { journalStorageKey } from "./session-journal-keys.js";
import { type SessionJournalStorage, SessionJournalStore } from "./session-journal-store.js";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise = (_value: T): void => {};
  let rejectPromise = (_reason: unknown): void => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

class DeferredSessionStorage implements SessionJournalStorage {
  private readonly data = new Map<string, unknown>();
  private readonly restoreGate = deferred<void>();
  private readonly firstSetGate = deferred<void>();
  private readonly firstSetStarted = deferred<void>();
  private shouldDelayFirstSet = false;

  async get(_keys: null): Promise<Record<string, unknown>> {
    const snapshot = Object.fromEntries(this.data.entries());
    await this.restoreGate.promise;
    return snapshot;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    if (this.shouldDelayFirstSet) {
      this.shouldDelayFirstSet = false;
      this.firstSetStarted.resolve();
      await this.firstSetGate.promise;
    }
    for (const [key, value] of Object.entries(items)) {
      this.data.set(key, value);
    }
  }

  remove(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }

  seed(tabId: number, journal: Journal): void {
    this.data.set(journalStorageKey(tabId), serializeJournal(journal));
  }

  releaseRestore(): void {
    this.restoreGate.resolve();
  }

  failRestore(reason: unknown): void {
    this.restoreGate.reject(reason);
  }

  deferFirstSet(): Promise<void> {
    this.shouldDelayFirstSet = true;
    return this.firstSetStarted.promise;
  }

  releaseFirstSet(): void {
    this.firstSetGate.resolve();
  }

  readJournal(tabId: number): Journal | null {
    const value = this.data.get(journalStorageKey(tabId));
    if (typeof value !== "string") {
      return null;
    }
    const parsed = deserializeJournal(value);
    return parsed.success ? parsed.data : null;
  }
}

function createBackgroundTransport(): BusTransport & {
  readonly receive: (message: BusMessage, sender: MessageContext) => void;
} {
  const subscribers = new Set<(message: BusMessage, sender: MessageContext) => void>();
  return {
    route: "background",
    send: () => {},
    subscribe: (handler) => {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },
    receive: (message, sender) => {
      for (const handler of subscribers) {
        handler(message, sender);
      }
    },
  };
}

class BackgroundJournalHarness {
  readonly store: SessionJournalStore;
  readonly transport = createBackgroundTransport();
  readonly bus = new MessageBus({ route: "background", transport: this.transport });
  readonly panelMessages: BusMessage[] = [];
  readonly firstPublished = deferred<BusMessage>();
  readonly secondJournalChanged = deferred<void>();
  private journalChangeCount = 0;

  constructor(storage: SessionJournalStorage, onTaskError?: (error: unknown) => void) {
    this.store = new SessionJournalStore({
      storage,
      ...(onTaskError !== undefined ? { onTaskError } : {}),
    });
    installBackgroundJournalHandlers({
      store: this.store,
      bus: this.bus,
      broadcastToPanel: (message) => {
        this.panelMessages.push(message);
        this.firstPublished.resolve(message);
      },
      sendToTabContent: () => {},
      onJournalChanged: () => {
        this.journalChangeCount += 1;
        if (this.journalChangeCount === 2) this.secondJournalChanged.resolve();
      },
    });
  }
}

function styleEdit(id: string): Operation {
  return {
    id,
    timestamp: 1_700_000_000_000,
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

function journalWithOperation(operationId: string): Journal {
  return appendEntry(
    createJournal(),
    createJournalEntry({
      id: `je-${operationId}`,
      changeSetId: "cs-readiness-001",
      transactionId: `tx-${operationId}`,
      sequence: 0,
      operation: styleEdit(operationId),
      status: "committed",
    }),
  );
}

describe("background journal restoration readiness", () => {
  it("waits for persisted history before answering an initial journal request", async () => {
    // Given: a service-worker restore whose session-storage read is still pending.
    const tabId = 7;
    const storage = new DeferredSessionStorage();
    storage.seed(tabId, journalWithOperation("op-persisted-001"));
    const harness = new BackgroundJournalHarness(storage);
    const restoration = harness.store.restore();

    // When: the panel requests its journal before storage restoration completes.
    harness.transport.receive(createJournalRequestMessage(tabId), { route: "panel", tabId });

    // Then: no stale null state is published, and the eventual response is restored history.
    expect(harness.panelMessages).toEqual([]);
    storage.releaseRestore();
    await restoration;
    const payload = parseJournalStatePayload((await harness.firstPublished.promise).payload);
    expect(payload?.journal?.entries[0]?.operation.id).toBe("op-persisted-001");
    harness.bus.dispose();
  });

  it("preserves a reconciled replacement received while restoration is pending", async () => {
    // Given: persisted history and a replacement that adds local history while restore is pending.
    const tabId = 11;
    const storage = new DeferredSessionStorage();
    const persisted = journalWithOperation("op-persisted-002");
    const replacement = appendEntry(
      persisted,
      createJournalEntry({
        id: "je-op-local-002",
        changeSetId: "cs-readiness-002",
        transactionId: "tx-op-local-002",
        sequence: 1,
        operation: styleEdit("op-local-002"),
        status: "committed",
      }),
    );
    storage.seed(tabId, persisted);
    const harness = new BackgroundJournalHarness(storage);
    const restoration = harness.store.restore();

    // When: the full reconciled replacement arrives before the delayed storage read resolves.
    harness.transport.receive(createJournalReplaceMessage(tabId, replacement), {
      route: "panel",
      tabId,
    });
    storage.releaseRestore();
    await restoration;
    await harness.firstPublished.promise;

    // Then: late restoration cannot erase the local entry from memory or session storage.
    const expectedIds = ["op-persisted-002", "op-local-002"];
    expect(harness.store.get(tabId).entries.map((entry) => entry.operation.id)).toEqual(
      expectedIds,
    );
    expect(storage.readJournal(tabId)?.entries.map((entry) => entry.operation.id)).toEqual(
      expectedIds,
    );
    harness.bus.dispose();
  });

  it("reports restore failure once before resuming queued journal work", async () => {
    // Given: a restore failure observer and an initial request waiting behind storage.
    const tabId = 19;
    const storage = new DeferredSessionStorage();
    const restoreError = new Error("session storage unavailable");
    const observedErrors: unknown[] = [];
    const harness = new BackgroundJournalHarness(storage, (error) => observedErrors.push(error));
    const restoration = harness.store.restore();
    harness.transport.receive(createJournalRequestMessage(tabId), { route: "panel", tabId });

    // When: chrome.storage.session rejects the restoration read.
    storage.failRestore(restoreError);
    await restoration;
    const payload = parseJournalStatePayload((await harness.firstPublished.promise).payload);

    // Then: the failure is observed once and the offline journal queue remains usable.
    expect(observedErrors).toEqual([restoreError]);
    expect(payload).toEqual({ tabId, journal: null });
    harness.bus.dispose();
  });

  it("serializes ready replacements before publishing a following request", async () => {
    // Given: a restored store whose first post-ready session write is deferred.
    const tabId = 23;
    const storage = new DeferredSessionStorage();
    const harness = new BackgroundJournalHarness(storage);
    const restoration = harness.store.restore();
    storage.releaseRestore();
    await restoration;
    const firstSetStarted = storage.deferFirstSet();

    // When: an older replacement blocks, then a newer replacement and request arrive.
    harness.transport.receive(
      createJournalReplaceMessage(tabId, journalWithOperation("op-older-001")),
      { route: "panel", tabId },
    );
    await firstSetStarted;
    harness.transport.receive(
      createJournalReplaceMessage(tabId, journalWithOperation("op-newer-001")),
      { route: "panel", tabId },
    );
    harness.transport.receive(createJournalRequestMessage(tabId), { route: "panel", tabId });
    const publishedBeforeRelease = harness.panelMessages.length;
    storage.releaseFirstSet();
    await harness.secondJournalChanged.promise;

    // Then: no request overtakes the write, and memory plus persistence retain the newer state.
    expect(publishedBeforeRelease).toBe(0);
    expect(harness.store.get(tabId).entries[0]?.operation.id).toBe("op-newer-001");
    expect(storage.readJournal(tabId)?.entries[0]?.operation.id).toBe("op-newer-001");
    harness.bus.dispose();
  });
});
