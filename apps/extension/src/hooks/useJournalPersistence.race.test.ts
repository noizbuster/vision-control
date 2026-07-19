import { act, renderHook } from "@testing-library/react";
import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import { describe, expect, it, vi } from "vitest";

import { createJournalStateMessage } from "../journal/journal-messages.js";
import { type BusMessage, type BusTransport, MessageBus } from "../messaging/index.js";
import { useJournal } from "./useJournal.js";
import { useJournalPersistence } from "./useJournalPersistence.js";

const operation = (id: string): Operation => ({
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
});

const journalWithOperation = (id: string): Journal =>
  appendEntry(
    createJournal(),
    createJournalEntry({
      id: `je-${id}`,
      changeSetId: "cs-hydration-race",
      transactionId: `tx-${id}`,
      sequence: 0,
      operation: operation(id),
      status: "committed",
    }),
  );

const createTestBus = (): {
  readonly bus: MessageBus;
  readonly sent: readonly BusMessage[];
  readonly emit: (message: BusMessage) => void;
} => {
  const sent: BusMessage[] = [];
  let receiver: Parameters<BusTransport["subscribe"]>[0] | undefined;
  const transport: BusTransport = {
    route: "panel",
    send: (_target, message) => {
      sent.push(message);
    },
    subscribe: (handler) => {
      receiver = handler;
      return () => {
        receiver = undefined;
      };
    },
  };
  return {
    bus: new MessageBus({ route: "panel", transport }),
    sent,
    emit: (message) => receiver?.(message, { route: "background" }),
  };
};

describe("useJournalPersistence hydration ordering", () => {
  it("retains and first-syncs an interaction recorded before journal-state", async () => {
    vi.useFakeTimers();
    const testBus = createTestBus();
    const stored = journalWithOperation("op-stored-before-panel");
    const { result } = renderHook(() => {
      const journal = useJournal({ previewEngine: null });
      const persistence = useJournalPersistence({
        journal: journal.journal,
        tabId: 17,
        bus: testBus.bus,
        onRestore: journal.replaceJournal,
      });
      return { journal, persistence };
    });

    act(() => result.current.journal.recordRemote(operation("op-local-before-hydration")));
    act(() => testBus.emit(createJournalStateMessage(17, stored)));

    expect(result.current.journal.journal.entries.map((entry) => entry.operation.id)).toEqual([
      "op-stored-before-panel",
      "op-local-before-hydration",
    ]);
    expect(result.current.persistence.isHydrated).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(350));

    const replacement = testBus.sent
      .filter((message) => message.messageType === "journal-replace")
      .at(-1);
    expect(replacement?.payload).toMatchObject({
      entries: [
        { operation: { id: "op-stored-before-panel" } },
        { operation: { id: "op-local-before-hydration" } },
      ],
    });
    testBus.bus.dispose();
    vi.useRealTimers();
  });
});
