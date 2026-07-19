import type { Operation } from "@vision-control/change-ir";
import { appendEntry, createJournal, createJournalEntry } from "@vision-control/change-journal";
import { describe, expect, it, vi } from "vitest";

import { type BusTransport, MessageBus } from "../messaging/bus.js";
import type { BusMessage, MessageContext } from "../messaging/types.js";
import { installBackgroundJournalHandlers } from "./background-journal-handlers.js";
import { createJournalReplaceMessage } from "./journal-messages.js";
import { SessionJournalStore } from "./session-journal-store.js";

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
  };
}

function journalWithOperation(operationId: string) {
  return appendEntry(
    createJournal(),
    createJournalEntry({
      id: `je-${operationId}`,
      changeSetId: "cs-authority-001",
      transactionId: `tx-${operationId}`,
      sequence: 0,
      operation: styleEdit(operationId),
      status: "committed",
    }),
  );
}

function createLinkedJournalBuses(sender: MessageContext): {
  readonly backgroundBus: MessageBus;
  readonly contentBus: MessageBus;
} {
  let receiveBackground: Parameters<BusTransport["subscribe"]>[0] | undefined;
  const backgroundBus = new MessageBus({
    route: "background",
    accept: () => true,
    transport: {
      route: "background",
      send: () => undefined,
      subscribe: (handler) => {
        receiveBackground = handler;
        return () => {
          receiveBackground = undefined;
        };
      },
    },
  });
  const contentBus = new MessageBus({
    route: "content",
    transport: {
      route: "content",
      send: (_target, message) => receiveBackground?.(message, sender),
      subscribe: () => () => undefined,
    },
  });
  return { backgroundBus, contentBus };
}

function installHarness(sender: MessageContext) {
  const store = new SessionJournalStore();
  const buses = createLinkedJournalBuses(sender);
  const journalChanges: number[] = [];
  installBackgroundJournalHandlers({
    store,
    bus: buses.backgroundBus,
    broadcastToPanel: () => undefined,
    sendToTabContent: () => undefined,
    onJournalChanged: (tabId) => journalChanges.push(tabId),
  });
  return { store, contentBus: buses.contentBus, journalChanges };
}

describe("background journal sender authority", () => {
  it("rejects a journal write whose message tab disagrees with the authenticated sender tab", async () => {
    // Given
    const harness = installHarness({ route: "content", tabId: 9, frameId: 0 });
    const message = createJournalReplaceMessage(7, journalWithOperation("op-forged-tab"));

    // When
    harness.contentBus.send("background", message);

    // Then
    await vi.waitFor(() => expect(harness.journalChanges).toEqual([]));
    expect(harness.store.has(7)).toBe(false);
    expect(harness.store.has(9)).toBe(false);
  });

  it("writes the journal when message and authenticated sender tabs agree", async () => {
    // Given
    const harness = installHarness({ route: "content", tabId: 9, frameId: 0 });
    const message: BusMessage = createJournalReplaceMessage(
      9,
      journalWithOperation("op-authentic-tab"),
    );

    // When
    harness.contentBus.send("background", message);

    // Then
    await vi.waitFor(() => expect(harness.journalChanges).toEqual([9]));
    expect(harness.store.get(9).entries[0]?.operation.id).toBe("op-authentic-tab");
  });
});
