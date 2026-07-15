import { act, renderHook } from "@testing-library/react";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it, vi } from "vitest";

import type { BusMessage, BusMessageHandler, MessageBus } from "../messaging/index.js";
import { useJournalPersistence } from "./useJournalPersistence.js";

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

function createFakeBus(): MessageBus & {
  readonly sent: BusMessage[];
  readonly emit: (type: string, message: BusMessage) => void;
} {
  const handlers = new Map<string, Set<BusMessageHandler>>();
  const sent: BusMessage[] = [];
  return {
    getRoute: () => "panel",
    send: (_target, message) => {
      sent.push(message);
    },
    on: (type, handler) => {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
      return () => set.delete(handler);
    },
    dispose: () => handlers.clear(),
    get sent() {
      return sent;
    },
    emit: (type, message) => {
      for (const handler of handlers.get(type) ?? []) {
        void handler(message, { route: "background" });
      }
    },
  } as MessageBus & {
    readonly sent: BusMessage[];
    readonly emit: (type: string, message: BusMessage) => void;
  };
}

describe("useJournalPersistence (offline session path)", () => {
  it("requests rehydrate on mount and applies journal-state", () => {
    const bus = createFakeBus();
    const restored: Journal[] = [];
    const empty = createJournal();

    renderHook(() =>
      useJournalPersistence({
        journal: empty,
        tabId: 9,
        bus,
        onRestore: (j) => restored.push(j),
      }),
    );

    expect(bus.sent.some((m) => m.messageType === "journal-request")).toBe(true);

    const stored = journalWithOp("op-panel-restore");
    act(() => {
      bus.emit("journal-state", {
        protocolVersion: "1.0.0",
        messageId: "state-1",
        messageType: "journal-state",
        targetRoute: "panel",
        tabId: 9,
        payload: { tabId: 9, journal: stored },
        timestamp: Date.now(),
      });
    });

    expect(restored).toHaveLength(1);
    expect(restored[0]?.entries[0]?.operation.id).toBe("op-panel-restore");
  });

  it("sends journal-replace after hydrate when journal changes (no storage dual-write)", async () => {
    vi.useFakeTimers();
    const bus = createFakeBus();
    let journal = createJournal();

    const { rerender, result } = renderHook(
      ({ j }: { j: Journal }) =>
        useJournalPersistence({
          journal: j,
          tabId: 4,
          bus,
          onRestore: () => {},
        }),
      { initialProps: { j: journal } },
    );

    act(() => {
      bus.emit("journal-state", {
        protocolVersion: "1.0.0",
        messageId: "state-2",
        messageType: "journal-state",
        targetRoute: "panel",
        tabId: 4,
        payload: { tabId: 4, journal: null },
        timestamp: Date.now(),
      });
    });

    expect(result.current.isHydrated).toBe(true);

    journal = journalWithOp("op-panel-mutate");
    rerender({ j: journal });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    const replaces = bus.sent.filter((m) => m.messageType === "journal-replace");
    expect(replaces.length).toBeGreaterThanOrEqual(1);
    expect(replaces.at(-1)?.tabId).toBe(4);
    expect((replaces.at(-1)?.payload as Journal).entries[0]?.operation.id).toBe("op-panel-mutate");

    vi.useRealTimers();
  });

  it("is a no-op without bus or tabId (offline-safe, no daemon client)", () => {
    const { result } = renderHook(() =>
      useJournalPersistence({
        journal: createJournal(),
        tabId: undefined,
        bus: undefined,
      }),
    );
    expect(result.current.isHydrated).toBe(false);
    expect(result.current.isSyncing).toBe(false);
  });
});
