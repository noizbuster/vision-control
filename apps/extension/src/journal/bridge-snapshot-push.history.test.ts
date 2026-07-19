import type { BridgeClient } from "@vision-control/bridge-client";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
  markEntrySuperseded,
  redo,
  undo,
} from "@vision-control/change-journal";
import {
  type VisionContextSnapshot,
  VisionContextSnapshotSchema,
} from "@vision-control/context-compiler";
import { describe, expect, it } from "vitest";

import { createBridgeSnapshotPushController } from "./bridge-snapshot-push.js";
import { makeFlexResizeOperation } from "./flex-resize-operation.test-fixture.js";

const ENTRY_ID = "je-bridge-history";

describe("bridge snapshot journal history", () => {
  it("removes an undone pair and restores it after Redo", () => {
    const operation = makeFlexResizeOperation();
    let journal: Journal = appendEntry(
      createJournal(),
      createJournalEntry({
        id: ENTRY_ID,
        changeSetId: "cs-bridge-history",
        transactionId: "tx-bridge-history",
        sequence: 0,
        operation,
        status: "committed",
      }),
    );
    const snapshots: VisionContextSnapshot[] = [];
    const client: Pick<BridgeClient, "state" | "pushSnapshot" | "clearTab" | "focusTab"> = {
      state: "connected",
      pushSnapshot: (input) => snapshots.push(VisionContextSnapshotSchema.parse(input.snapshot)),
      clearTab: () => undefined,
      focusTab: () => undefined,
    };
    const controller = createBridgeSnapshotPushController({
      getClient: () => client,
      getJournal: () => journal,
      getSessionId: () => "session-history",
    });

    journal = undo(journal).journal;
    controller.noteJournalChanged(7);
    journal = redo(journal).journal;
    controller.noteJournalChanged(7);

    expect(snapshots.map((snapshot) => snapshot.operations.length)).toEqual([0, 1]);
    expect(snapshots[1]?.operations).toMatchObject([{ kind: "resize-flex-pair" }]);
  });

  it("pushes superseded history without active operations or undo state", () => {
    let journal: Journal = appendEntry(
      createJournal(),
      createJournalEntry({
        id: ENTRY_ID,
        changeSetId: "cs-bridge-history",
        transactionId: "tx-bridge-history",
        sequence: 0,
        operation: makeFlexResizeOperation(),
        status: "committed",
      }),
    );
    const snapshots: VisionContextSnapshot[] = [];
    const client: Pick<BridgeClient, "state" | "pushSnapshot" | "clearTab" | "focusTab"> = {
      state: "connected",
      pushSnapshot: (input) => snapshots.push(VisionContextSnapshotSchema.parse(input.snapshot)),
      clearTab: () => undefined,
      focusTab: () => undefined,
    };
    const controller = createBridgeSnapshotPushController({
      getClient: () => client,
      getJournal: () => journal,
      getSessionId: () => "session-history",
    });

    journal = markEntrySuperseded(journal, ENTRY_ID);
    controller.noteJournalChanged(7);

    expect(snapshots[0]?.operations).toEqual([]);
    expect(snapshots[0]?.journal).toMatchObject({
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
    });
  });
});
