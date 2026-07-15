/**
 * @offline-sot — ADR-019 offline edit loop proof (plan task 4).
 *
 * Proves select + preview edit + undo/redo + journal restore after panel remount
 * with no daemon/MCP processes. Integration of content-runtime (overlay +
 * preview apply) and SessionJournalStore (C1 sole writer + bus rehydrate).
 *
 * Panel browser e2e is optional; this file is the non-fixme automated proof.
 */

import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  createJournal,
  createJournalEntry,
  type Journal,
  redo,
  undo,
} from "@vision-control/change-journal";
import { computeInverse, type Operation } from "@vision-control/change-ir";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageBus } from "../messaging/bus.js";
import type { BusMessage, BusMessageHandler, BusRoute, MessageContext } from "../messaging/types.js";
import { wireContentEditHandlers } from "../overlay/content-edit-wiring.js";
import {
  createOverlayRuntime,
  type OverlayRuntime,
  type OverlayRuntimeBus,
} from "../overlay/overlay-runtime.js";
import { installBackgroundJournalHandlers } from "./background-journal-handlers.js";
import {
  createJournalReplaceMessage,
  createJournalRequestMessage,
  JOURNAL_STATE_TYPE,
  parseJournalStatePayload,
} from "./journal-messages.js";
import { journalStorageKey } from "./session-journal-keys.js";
import { SessionJournalStore } from "./session-journal-store.js";

const BASE_TIME = 1_700_000_000_000;
const TAB_ID = 77;

function installObserverMocks(): void {
  const instance = () => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  });
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
    return instance();
  }) as unknown as typeof ResizeObserver;
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.IntersectionObserver = vi.fn().mockImplementation(function () {
    return instance();
  }) as unknown as typeof IntersectionObserver;
}

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn((): MediaQueryList => ({ matches: false, media: "" }) as MediaQueryList),
    configurable: true,
    writable: true,
  });
}

function setRect(element: Element, x: number, y: number, w: number, h: number): void {
  vi.spyOn(element as HTMLElement, "getBoundingClientRect").mockReturnValue({
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  } as DOMRect);
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

function createOfflineBus(): MessageBus & {
  readonly emit: (type: string, message: BusMessage, sender?: MessageContext) => void;
  readonly deliver: (route: BusRoute, message: BusMessage) => void;
} {
  const handlers = new Map<string, Set<BusMessageHandler>>();
  return {
    getRoute: () => "background",
    send: () => {},
    on: (type, handler) => {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
      return () => set.delete(handler);
    },
    dispose: () => handlers.clear(),
    emit: (type, message, sender = { route: "panel", tabId: message.tabId ?? TAB_ID }) => {
      for (const handler of handlers.get(type) ?? []) {
        handler(message, sender);
      }
    },
    deliver: (_route, message) => {
      for (const handler of handlers.get(message.messageType) ?? []) {
        handler(message, { route: "background", tabId: message.tabId });
      }
    },
  } as unknown as MessageBus & {
    readonly emit: (type: string, message: BusMessage, sender?: MessageContext) => void;
    readonly deliver: (route: BusRoute, message: BusMessage) => void;
  };
}

function createContentBus(
  onSendToBackground: (message: BusMessage) => void,
): OverlayRuntimeBus & {
  readonly emit: (messageType: string, payload: unknown) => void;
  readonly deliver: (message: BusMessage) => void;
} {
  const handlers = new Map<string, Set<BusMessageHandler>>();
  return {
    send: (route, message) => {
      if (route === "background") {
        onSendToBackground(message);
      }
    },
    on: (messageType, handler) => {
      const set = handlers.get(messageType) ?? new Set();
      set.add(handler);
      handlers.set(messageType, set);
      return () => set.delete(handler);
    },
    emit: (messageType, payload) => {
      const message = {
        protocolVersion: "1.0.0",
        messageId: `test-${messageType}-${Date.now()}`,
        messageType,
        sourceRoute: "background" as BusRoute,
        targetRoute: "content" as BusRoute,
        tabId: TAB_ID,
        payload,
        timestamp: Date.now(),
      } as BusMessage;
      for (const handler of handlers.get(messageType) ?? []) {
        handler(message, { route: "background", tabId: TAB_ID });
      }
    },
    deliver: (message) => {
      for (const handler of handlers.get(message.messageType) ?? []) {
        handler(message, { route: "background", tabId: TAB_ID });
      }
    },
  };
}

function styleEdit(id: string, runtimeId: string, value: string, previousValue: string): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "style-edit",
    target: { runtimeId },
    property: "color",
    value,
    important: false,
    previousValue,
  };
}

function classAdd(id: string, runtimeId: string, className: string): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "class-add",
    target: { runtimeId },
    className,
  };
}

function appendCommitted(journal: Journal, operation: Operation, sequence: number): Journal {
  return appendEntry(
    journal,
    createJournalEntry({
      id: `je-${operation.id}`,
      changeSetId: "csoffline01",
      transactionId: `tx-${operation.id}`,
      sequence,
      operation,
      status: "committed",
    }),
  );
}

async function listVisionControlDaemonArgs(): Promise<string[]> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("ps", ["-eo", "args="], {
      maxBuffer: 2_000_000,
      encoding: "utf8",
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          /apps\/daemon\/dist|packages\/mcp-server\/dist|mcp-server\/dist\/bin/i.test(line) &&
          !/nx\/dist\/src\/daemon|offline-sot|vitest|grep|ps -eo/i.test(line),
      );
  } catch {
    return [];
  }
}

function newlySpawned(before: readonly string[], after: readonly string[]): string[] {
  const prior = new Set(before);
  return after.filter((line) => !prior.has(line));
}

describe("@offline-sot offline edit loop (no daemon/MCP)", () => {
  let storage: ReturnType<typeof createMemorySessionStorage>;
  let store: SessionJournalStore;
  let bgBus: ReturnType<typeof createOfflineBus>;
  let contentBus: ReturnType<typeof createContentBus>;
  let runtime: OverlayRuntime | null = null;
  let editWiring: { dispose: () => void } | null = null;
  let journalHandlers: ReturnType<typeof installBackgroundJournalHandlers> | null = null;
  let panelStateMessages: BusMessage[];
  let contentStateMessages: BusMessage[];

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
    installMatchMedia();

    storage = createMemorySessionStorage();
    store = new SessionJournalStore({ storage });
    bgBus = createOfflineBus();
    panelStateMessages = [];
    contentStateMessages = [];

    contentBus = createContentBus((message) => {
      bgBus.emit(message.messageType, { ...message, tabId: message.tabId ?? TAB_ID }, {
        route: "content",
        tabId: TAB_ID,
      });
    });

    journalHandlers = installBackgroundJournalHandlers({
      store,
      bus: bgBus,
      broadcastToPanel: (message) => {
        panelStateMessages.push(message);
      },
      sendToTabContent: (_tabId, message) => {
        contentStateMessages.push(message);
        contentBus.deliver(message);
      },
    });

    runtime = createOverlayRuntime({ document, bus: contentBus });
    runtime.start();
    contentBus.emit("interaction-mode", { mode: "Inspect" });
    editWiring = wireContentEditHandlers(contentBus, runtime);
  });

  afterEach(() => {
    editWiring?.dispose();
    runtime?.dispose();
    journalHandlers?.dispose();
    runtime = null;
    editWiring = null;
    journalHandlers = null;
  });

  it("selects, preview-edits, undoes/redoes, and restores journal after panel remount without daemon", async () => {
    const daemonArgsBefore = await listVisionControlDaemonArgs();

    const target = document.createElement("button");
    target.id = "offline-target";
    target.textContent = "Edit me";
    target.className = "base";
    setRect(target, 10, 10, 80, 24);
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const runtimeId = target.getAttribute("data-vc-preview-id");
    expect(runtimeId, "selection must assign a preview id").not.toBeNull();
    if (runtimeId === null) return;

    const styleOp = styleEdit("opoffline1", runtimeId, "rgb(0, 0, 255)", "rgb(0, 0, 0)");
    contentBus.emit("editor-command", styleOp);

    const styleEl = document.head.querySelector<HTMLStyleElement>(
      "style[data-vc-preview-stylesheet]",
    );
    expect(styleEl, "preview stylesheet must inject").not.toBeNull();
    expect(styleEl?.textContent ?? "").toContain(`[data-vc-preview-id="${runtimeId}"]`);
    expect(styleEl?.textContent ?? "").toContain("color: rgb(0, 0, 255)");

    const classOp = classAdd("opoffline2", runtimeId, "offline-highlight");
    contentBus.emit("editor-command", classOp);
    expect(target.classList.contains("offline-highlight")).toBe(true);

    let panelJournal = createJournal();
    panelJournal = appendCommitted(panelJournal, styleOp, 0);
    panelJournal = appendCommitted(panelJournal, classOp, 1);

    bgBus.emit("journal-replace", createJournalReplaceMessage(TAB_ID, panelJournal), {
      route: "panel",
      tabId: TAB_ID,
    });

    await vi.waitFor(() => {
      expect(store.has(TAB_ID)).toBe(true);
      expect(store.get(TAB_ID).entries).toHaveLength(2);
    });
    expect(storage.data.has(journalStorageKey(TAB_ID))).toBe(true);
    expect(panelStateMessages.some((m) => m.messageType === JOURNAL_STATE_TYPE)).toBe(true);
    expect(contentStateMessages.some((m) => m.messageType === JOURNAL_STATE_TYPE)).toBe(true);

    expect(canUndoJournal(panelJournal)).toBe(true);
    const undo1 = undo(panelJournal);
    panelJournal = undo1.journal;
    contentBus.emit("editor-command", undo1.inverse);
    expect(target.classList.contains("offline-highlight")).toBe(false);
    expect(canRedoJournal(panelJournal)).toBe(true);

    const undo2 = undo(panelJournal);
    panelJournal = undo2.journal;
    contentBus.emit("editor-command", undo2.inverse);
    expect(canUndoJournal(panelJournal)).toBe(false);
    expect(canRedoJournal(panelJournal)).toBe(true);

    const redo1 = redo(panelJournal);
    panelJournal = redo1.journal;
    contentBus.emit("editor-command", redo1.operation);
    expect(styleEl?.textContent ?? document.head.innerHTML).toBeTruthy();

    const redo2 = redo(panelJournal);
    panelJournal = redo2.journal;
    contentBus.emit("editor-command", redo2.operation);
    expect(target.classList.contains("offline-highlight")).toBe(true);
    expect(canUndoJournal(panelJournal)).toBe(true);
    expect(canRedoJournal(panelJournal)).toBe(false);

    bgBus.emit("journal-replace", createJournalReplaceMessage(TAB_ID, panelJournal), {
      route: "panel",
      tabId: TAB_ID,
    });
    await vi.waitFor(() => {
      expect(store.get(TAB_ID).entries).toHaveLength(2);
      expect(store.get(TAB_ID).stacks.undo.length).toBeGreaterThan(0);
    });

    panelStateMessages.length = 0;
    const remountedPanelJournal: Journal[] = [];

    const panelRemountUnsub = bgBus.on(JOURNAL_STATE_TYPE, (message) => {
      const payload = parseJournalStatePayload(message.payload);
      if (payload === null || payload.tabId !== TAB_ID || payload.journal === null) {
        return;
      }
      remountedPanelJournal.push(payload.journal);
    });

    const restoredStore = new SessionJournalStore({ storage });
    expect(restoredStore.has(TAB_ID)).toBe(false);
    await restoredStore.restore();
    expect(restoredStore.has(TAB_ID)).toBe(true);

    journalHandlers?.dispose();
    journalHandlers = installBackgroundJournalHandlers({
      store: restoredStore,
      bus: bgBus,
      broadcastToPanel: (message) => {
        panelStateMessages.push(message);
        bgBus.deliver("panel", message);
      },
      sendToTabContent: (_tabId, message) => {
        contentStateMessages.push(message);
        contentBus.deliver(message);
      },
    });

    bgBus.emit("journal-request", createJournalRequestMessage(TAB_ID), {
      route: "panel",
      tabId: TAB_ID,
    });

    await vi.waitFor(() => {
      expect(remountedPanelJournal.length).toBeGreaterThanOrEqual(1);
    });

    const restored = remountedPanelJournal.at(-1);
    expect(restored).toBeDefined();
    if (restored === undefined) return;
    expect(restored.entries).toHaveLength(2);
    expect(restored.entries[0]?.operation.id).toBe("opoffline1");
    expect(restored.entries[1]?.operation.id).toBe("opoffline2");
    expect(restored.stacks.undo.length).toBe(panelJournal.stacks.undo.length);
    expect(canUndoJournal(restored)).toBe(true);

    const postRemountUndo = undo(restored);
    contentBus.emit("editor-command", postRemountUndo.inverse);
    expect(target.classList.contains("offline-highlight")).toBe(false);

    const styleInverse = computeInverse(styleOp);
    expect(styleInverse.kind).toBe("style-edit");
    if (styleInverse.kind === "style-edit") {
      expect(styleInverse.value).toBe("rgb(0, 0, 0)");
    }

    panelRemountUnsub();

    const daemonArgsAfter = await listVisionControlDaemonArgs();
    expect(
      newlySpawned(daemonArgsBefore, daemonArgsAfter),
      "offline suite must not spawn daemon/MCP processes",
    ).toEqual([]);
  });

  it("isolates offline journals per tab without MCP projection", async () => {
    const tabA = 10;
    const tabB = 20;
    const journalA = appendCommitted(
      createJournal(),
      styleEdit("opofftabA", "rt-a", "blue", "red"),
      0,
    );
    const journalB = appendCommitted(
      createJournal(),
      classAdd("opofftabB", "rt-b", "other"),
      0,
    );

    bgBus.emit("journal-replace", createJournalReplaceMessage(tabA, journalA), {
      route: "panel",
      tabId: tabA,
    });
    bgBus.emit("journal-replace", createJournalReplaceMessage(tabB, journalB), {
      route: "panel",
      tabId: tabB,
    });

    await vi.waitFor(() => {
      expect(store.get(tabA).entries[0]?.operation.id).toBe("opofftabA");
      expect(store.get(tabB).entries[0]?.operation.id).toBe("opofftabB");
    });

    expect([...storage.data.keys()].sort()).toEqual(
      [journalStorageKey(tabA), journalStorageKey(tabB)].sort(),
    );
  });
});
