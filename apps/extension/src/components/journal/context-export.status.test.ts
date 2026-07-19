import {
  appendEntry,
  createJournal,
  createJournalEntry,
  markEntrySuperseded,
  redo,
  undo,
} from "@vision-control/change-journal";
import { describe, expect, it } from "vitest";

import { makeFlexResizeOperation } from "../../journal/flex-resize-operation.test-fixture.js";
import { buildPanelContextExport } from "./context-export.js";

const ENTRY_ID = "je-projection-status";

const committedPairJournal = () => {
  const operation = makeFlexResizeOperation();
  return appendEntry(
    createJournal(),
    createJournalEntry({
      id: ENTRY_ID,
      changeSetId: "cs-projection-status",
      transactionId: "tx-projection-status",
      sequence: 0,
      operation,
      status: "committed",
    }),
  );
};

describe("buildPanelContextExport journal status", () => {
  it("does not project an undone pair as an active operation", () => {
    const undone = undo(committedPairJournal()).journal;

    const snapshot = buildPanelContextExport({ selection: null, journal: undone }).snapshot;

    expect(snapshot.operations).toEqual([]);
    expect(snapshot.journal).toMatchObject({ canUndo: false, canRedo: true, redoDepth: 1 });
  });

  it("projects the pair again after Redo", () => {
    const undone = undo(committedPairJournal()).journal;
    const redone = redo(undone).journal;

    const snapshot = buildPanelContextExport({ selection: null, journal: redone }).snapshot;

    expect(snapshot.operations).toMatchObject([{ kind: "resize-flex-pair" }]);
    expect(snapshot.journal).toMatchObject({ canUndo: true, canRedo: false, undoDepth: 1 });
  });

  it("exports superseded history without active operations or undo state", () => {
    const superseded = markEntrySuperseded(committedPairJournal(), ENTRY_ID);

    const snapshot = buildPanelContextExport({ selection: null, journal: superseded }).snapshot;

    expect(snapshot.operations).toEqual([]);
    expect(snapshot.journal).toEqual({
      entryCount: 1,
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
      recentKinds: [],
    });
  });
});
