import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import { OperationSchema } from "@vision-control/change-ir";
import { createJournal, JournalSchema } from "@vision-control/change-journal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJournalStateMessage } from "./journal/journal-messages.js";
import type { BusMessage, BusMessageHandler, MessageContext } from "./messaging/index.js";

const panelBusState = vi.hoisted(() => {
  const handlers = new Map<string, Set<BusMessageHandler>>();
  const send = vi.fn<(targetRoute: string, message: BusMessage) => void>();
  const on = vi.fn<(messageType: string, handler: BusMessageHandler) => () => void>(
    (messageType, handler) => {
      const registered = handlers.get(messageType) ?? new Set<BusMessageHandler>();
      registered.add(handler);
      handlers.set(messageType, registered);
      return () => registered.delete(handler);
    },
  );
  return { handlers, bus: { send, on } };
});

vi.mock("./hooks/usePanelBus.js", () => ({
  usePanelBus: () => panelBusState.bus,
}));
vi.mock("./hooks/useSelectionSummary.js", () => ({
  useSelectionSummary: () => ({
    summary: null,
    originState: { status: "idle" },
    selectElement: () => {},
  }),
}));
vi.mock("./hooks/useFrameTree.js", () => ({ useFrameTree: () => [] }));
vi.mock("./hooks/useMultiSelect.js", () => ({ useMultiSelect: () => ({ group: null }) }));
vi.mock("./hooks/useGridPlacement.js", () => ({
  useGridPlacement: () => ({ state: null }),
}));
vi.mock("./hooks/useComponentProps.js", () => ({
  useComponentProps: () => ({ componentProps: [] }),
}));

import { App } from "./App.js";

function installChrome(tabId: number): void {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      devtools: {
        inspectedWindow: { tabId },
        panels: { themeName: "default" },
      },
      runtime: {
        lastError: undefined,
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => {}, removeListener: () => {} },
        connect: () => ({
          onMessage: { addListener: () => {}, removeListener: () => {} },
          onDisconnect: { addListener: () => {}, removeListener: () => {} },
          disconnect: () => {},
          postMessage: () => {},
        }),
      },
      tabs: {
        get: (_requestedTabId: number, callback: (tab: { title: string; url: string }) => void) => {
          callback({ title: `Tab ${tabId}`, url: `http://localhost:${3000 + tabId}/` });
        },
      },
    },
    writable: true,
  });
}

function deliver(messageType: string, message: BusMessage, context: MessageContext): void {
  const handlers = panelBusState.handlers.get(messageType) ?? [];
  for (const handler of handlers) void handler(message, context);
}

function persistedOperationIds(tabId: number): readonly string[] {
  const ids: string[] = [];
  for (const [, message] of panelBusState.bus.send.mock.calls) {
    if (message.messageType !== "journal-replace" || message.tabId !== tabId) continue;
    const parsed = JournalSchema.safeParse(message.payload);
    if (!parsed.success) continue;
    for (const entry of parsed.data.entries) ids.push(entry.operation.id);
  }
  return ids;
}

describe("App interaction operation tab isolation", () => {
  beforeEach(() => {
    panelBusState.handlers.clear();
    panelBusState.bus.send.mockClear();
    panelBusState.bus.on.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("records a schema-parsed tab A operation once while tab B cannot persist it", async () => {
    // Given
    const tabA = 41;
    const tabB = 42;
    installChrome(tabA);
    const panelA = render(<App />);
    installChrome(tabB);
    const panelB = render(<App />);
    const operation = OperationSchema.parse({
      id: "op-tab-a-reparent",
      timestamp: 1_700_000_000_000,
      runtime: false,
      origin: "canvas-drag",
      confidence: 1,
      kind: "reparent-element",
      element: { runtimeId: "child-a" },
      sourceParent: { runtimeId: "source-a" },
      sourceIndex: 0,
      targetParent: { runtimeId: "target-a" },
      targetIndex: 1,
    });
    const backgroundContext: MessageContext = { route: "background" };
    act(() => {
      deliver("journal-state", createJournalStateMessage(tabA, createJournal()), backgroundContext);
      deliver("journal-state", createJournalStateMessage(tabB, createJournal()), backgroundContext);
    });

    // When
    act(() => {
      deliver(
        "interaction-operation",
        {
          protocolVersion: "1.0.0",
          messageId: "interaction-operation-op-tab-a-reparent",
          messageType: "interaction-operation",
          tabId: tabA,
          sourceRoute: "background",
          targetRoute: "panel",
          payload: operation,
          timestamp: 1_700_000_000_000,
        },
        backgroundContext,
      );
    });

    // Then
    await waitFor(() => {
      expect(within(panelA.container).getByTestId("change-journal-list").children).toHaveLength(1);
    });
    expect(within(panelB.container).queryByTestId("change-journal-list")).toBeNull();
    await waitFor(() => expect(persistedOperationIds(tabA)).toEqual([operation.id]));
    expect(persistedOperationIds(tabB)).toEqual([]);
  });

  it("rejects a kind-and-id shape that does not parse as a public operation", async () => {
    // Given
    const tabId = 43;
    installChrome(tabId);
    const panel = render(<App />);

    // When
    act(() => {
      deliver(
        "interaction-operation",
        {
          protocolVersion: "1.0.0",
          messageId: "interaction-operation-shape-only",
          messageType: "interaction-operation",
          tabId,
          sourceRoute: "background",
          targetRoute: "panel",
          payload: { id: "shape-only", kind: "style-edit" },
          timestamp: 1_700_000_000_000,
        },
        { route: "background" },
      );
    });

    // Then
    await waitFor(() => {
      expect(within(panel.container).getByTestId("change-journal-empty")).toBeDefined();
    });
  });
});
