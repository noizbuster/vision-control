import { appendEntry, createJournal, createJournalEntry } from "@vision-control/change-journal";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { describe, expect, it, vi } from "vitest";

import {
  createBridgeSnapshotPushController,
  parseSelectionSummaryPayload,
} from "./bridge-snapshot-push.js";

const BASE_TIME = 1_700_000_000_000;

function makeSelection(tagName = "button"): SelectionSummary {
  return {
    identity: {
      runtimeId: "runtime-1",
      tagName,
      sourceId: "src-button-1",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#submit",
    },
    breadcrumb: [
      { tagName: "body", selector: "body" },
      { tagName, selector: "#submit" },
    ],
    computedStyle: {
      display: "inline-flex",
      position: "static",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexBasis: "auto",
      flexGrow: "0",
      width: "120px",
      height: "40px",
      padding: "8px",
      margin: "0px",
      border: "1px solid rgb(0, 0, 0)",
      color: "rgb(0, 0, 0)",
      backgroundColor: "rgb(255, 255, 255)",
      fontSize: "16px",
      fontWeight: "600",
      lineHeight: "20px",
    },
    boxModel: {
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 1, right: 1, bottom: 1, left: 1 },
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      content: { width: 120, height: 40 },
      position: { x: 12, y: 24 },
    },
    classList: [{ name: "primary", source: "css" }],
    attributes: [{ name: "type", value: "submit" }],
    semantic: {
      tagName,
      role: "button",
      name: "Submit",
      textContentPreview: "Submit",
    },
    siblingSummary: { count: 3, index: 1, parentTagName: "form" },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
    activeBreakpoint: "md",
  };
}

function journalWithStyleOp() {
  const entry = createJournalEntry({
    id: "je-entry-0001",
    changeSetId: "csjournal001",
    transactionId: "tx-journal-001",
    sequence: 0,
    operation: {
      id: "op-style-00001",
      kind: "style-edit" as const,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
      timestamp: BASE_TIME,
      target: { runtimeId: "rt-1", sourceId: "src-1", selector: "#el" },
      property: "color",
      value: "red",
      important: false,
    },
    actor: "human",
    status: "committed",
  });
  return appendEntry(createJournal(), entry);
}

function makeConnectedClient() {
  const pushSnapshot = vi.fn();
  return {
    state: "connected" as const,
    pushSnapshot,
  };
}

describe("createBridgeSnapshotPushController", () => {
  it("emits snapshot.push via BridgeClient when selection changes while paired", () => {
    const client = makeConnectedClient();
    const journal = journalWithStyleOp();
    const controller = createBridgeSnapshotPushController({
      getClient: () => client as never,
      getJournal: () => journal,
      getSessionId: () => "sess-42",
      now: () => BASE_TIME,
    });

    controller.noteSelection(42, makeSelection("article"));

    expect(client.pushSnapshot).toHaveBeenCalledTimes(1);
    const arg = client.pushSnapshot.mock.calls[0]?.[0] as {
      tabId: string;
      snapshotRev: number;
      sessionId?: string;
      snapshot: {
        snapshotRev: number;
        tabId?: string;
        selection?: { semantic: { tagName: string } };
        operations: readonly unknown[];
      };
    };
    expect(arg.tabId).toBe("42");
    expect(arg.snapshotRev).toBe(1);
    expect(arg.sessionId).toBe("sess-42");
    expect(arg.snapshot.snapshotRev).toBe(1);
    expect(arg.snapshot.tabId).toBe("42");
    expect(arg.snapshot.selection?.semantic.tagName).toBe("article");
    expect(arg.snapshot.operations).toHaveLength(1);
  });

  it("increments snapshotRev monotonically per tab", () => {
    const client = makeConnectedClient();
    const controller = createBridgeSnapshotPushController({
      getClient: () => client as never,
      getJournal: () => createJournal(),
      getSessionId: () => undefined,
      now: () => BASE_TIME,
    });

    controller.noteSelection(7, makeSelection("div"));
    controller.noteJournalChanged(7);
    controller.noteSelection(7, null);

    const revs = client.pushSnapshot.mock.calls.map(
      (call) => (call[0] as { snapshotRev: number }).snapshotRev,
    );
    expect(revs).toEqual([1, 2, 3]);
  });

  it("does not push when bridge client is disconnected", () => {
    const pushSnapshot = vi.fn();
    const controller = createBridgeSnapshotPushController({
      getClient: () =>
        ({
          state: "disconnected",
          pushSnapshot,
        }) as never,
      getJournal: () => createJournal(),
      getSessionId: () => undefined,
    });

    controller.noteSelection(1, makeSelection());
    expect(pushSnapshot).not.toHaveBeenCalled();
  });

  it("does not push when no client is available", () => {
    const controller = createBridgeSnapshotPushController({
      getClient: () => undefined,
      getJournal: () => createJournal(),
      getSessionId: () => undefined,
    });

    expect(() => controller.noteSelection(1, makeSelection())).not.toThrow();
  });

  it("caches selection while unpaired then pushes on pushForTab after pair", () => {
    let client: ReturnType<typeof makeConnectedClient> | undefined;
    const controller = createBridgeSnapshotPushController({
      getClient: () => client as never,
      getJournal: () => createJournal(),
      getSessionId: () => "sess-late",
      now: () => BASE_TIME,
    });

    controller.noteSelection(9, makeSelection("section"));
    expect(client).toBeUndefined();

    client = makeConnectedClient();
    controller.pushForTab(9);

    expect(client.pushSnapshot).toHaveBeenCalledTimes(1);
    const snap = (
      client.pushSnapshot.mock.calls[0]?.[0] as {
        snapshot: { selection?: { semantic: { tagName: string } } };
      }
    ).snapshot;
    expect(snap.selection?.semantic.tagName).toBe("section");
  });

  it("isolates snapshotRev counters across tabs", () => {
    const client = makeConnectedClient();
    const controller = createBridgeSnapshotPushController({
      getClient: () => client as never,
      getJournal: () => createJournal(),
      getSessionId: () => undefined,
      now: () => BASE_TIME,
    });

    controller.noteSelection(1, makeSelection("a"));
    controller.noteSelection(2, makeSelection("b"));
    controller.noteSelection(1, makeSelection("c"));

    const byTab = client.pushSnapshot.mock.calls.map((call) => {
      const arg = call[0] as { tabId: string; snapshotRev: number };
      return { tabId: arg.tabId, rev: arg.snapshotRev };
    });
    expect(byTab).toEqual([
      { tabId: "1", rev: 1 },
      { tabId: "2", rev: 1 },
      { tabId: "1", rev: 2 },
    ]);
  });
});

describe("parseSelectionSummaryPayload", () => {
  it("returns null for clear payload", () => {
    expect(parseSelectionSummaryPayload(null)).toBeNull();
  });

  it("returns summary for valid selection", () => {
    const summary = makeSelection();
    expect(parseSelectionSummaryPayload(summary)).toBe(summary);
  });

  it("returns undefined for garbage", () => {
    expect(parseSelectionSummaryPayload({ foo: 1 })).toBeUndefined();
    expect(parseSelectionSummaryPayload("x")).toBeUndefined();
  });
});
