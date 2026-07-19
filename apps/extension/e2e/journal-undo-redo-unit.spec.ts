import { expect, test } from "@playwright/test";

import {
  appendOperation,
  type ChangeSet,
  type ClassAddOperation,
  computeInverse,
  createChangeSet,
  type StyleEditOperation,
  type TextEditOperation,
} from "@vision-control/change-ir";
import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  createJournal,
  createJournalEntry,
  deserializeJournal,
  redo,
  serializeJournal,
  undo,
} from "@vision-control/change-journal";

const styleOp: StyleEditOperation = {
  kind: "style-edit",
  id: "style-j001",
  timestamp: 1000,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  target: { runtimeId: "el-j001" },
  property: "padding",
  value: "24px",
  important: false,
  previousValue: "10px",
};

const textOp: TextEditOperation = {
  kind: "text-edit",
  id: "text-j001",
  timestamp: 2000,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  target: { runtimeId: "el-j001" },
  newText: "World",
  previousText: "Hello",
};

const classOp: ClassAddOperation = {
  kind: "class-add",
  id: "class-j001",
  timestamp: 3000,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  target: { runtimeId: "el-j001" },
  className: "highlight",
};

test.describe("@journal-undo-redo unit", () => {
  test("style-edit inverse swaps value and previousValue", () => {
    const inverse = computeInverse(styleOp);
    expect(inverse.kind).toBe("style-edit");
    if (inverse.kind === "style-edit") {
      expect(inverse.value).toBe("10px");
      expect(inverse.previousValue).toBe("24px");
    }
    expect(inverse.inverseOf).toBe(styleOp.id);
    expect(inverse.runtime).toBe(false);
  });

  test("text-edit inverse swaps newText and previousText", () => {
    const inverse = computeInverse(textOp);
    expect(inverse.kind).toBe("text-edit");
    if (inverse.kind === "text-edit") {
      expect(inverse.newText).toBe("Hello");
      expect(inverse.previousText).toBe("World");
    }
  });

  test("class-add inverse is class-remove with same target", () => {
    const inverse = computeInverse(classOp);
    expect(inverse.kind).toBe("class-remove");
    if (inverse.kind === "class-remove") {
      expect(inverse.className).toBe("highlight");
      expect(inverse.target.runtimeId).toBe("el-j001");
    }
  });

  test("journal entries are appendable and undoable", () => {
    let changeset: ChangeSet = createChangeSet({
      workspaceId: "ws-j001",
      sessionId: "sess-j001",
    });
    changeset = appendOperation(changeset, styleOp);
    changeset = appendOperation(changeset, textOp);
    expect(changeset.operations.length).toBe(2);
    expect(changeset.operations[0]?.id).toBe("style-j001");
    expect(changeset.operations[1]?.id).toBe("text-j001");
  });

  test("undo restores the previous style value via the stored inverse", () => {
    const entry = createJournalEntry({
      id: "je-undo-01",
      changeSetId: "cs-j01",
      transactionId: "tx-j01",
      sequence: 0,
      operation: styleOp,
    });
    const journal = appendEntry(createJournal(), entry);
    expect(canUndoJournal(journal)).toBe(true);

    const { inverse, journal: afterUndo } = undo(journal);
    expect(inverse.kind).toBe("style-edit");
    if (inverse.kind === "style-edit") {
      expect(inverse.value).toBe("10px");
      expect(inverse.previousValue).toBe("24px");
    }
    expect(canUndoJournal(afterUndo)).toBe(false);
    expect(canRedoJournal(afterUndo)).toBe(true);
  });

  test("redo re-applies the undone operation", () => {
    const entry = createJournalEntry({
      id: "je-redo-01",
      changeSetId: "cs-j02",
      transactionId: "tx-j02",
      sequence: 0,
      operation: styleOp,
    });
    const undoResult = undo(appendEntry(createJournal(), entry));
    const redoResult = redo(undoResult.journal);
    expect(redoResult.operation.kind).toBe("style-edit");
    if (redoResult.operation.kind === "style-edit") {
      expect(redoResult.operation.value).toBe("24px");
    }
    expect(canUndoJournal(redoResult.journal)).toBe(true);
  });

  test("daemon reconnect restores the journal from serialized persistence", () => {
    const entry = createJournalEntry({
      id: "je-restore-01",
      changeSetId: "cs-restore",
      transactionId: "tx-restore",
      sequence: 0,
      operation: styleOp,
    });
    const entry2 = createJournalEntry({
      id: "je-restore-02",
      changeSetId: "cs-restore",
      transactionId: "tx-restore",
      sequence: 1,
      operation: textOp,
    });
    const entry3 = createJournalEntry({
      id: "je-restore-03",
      changeSetId: "cs-restore",
      transactionId: "tx-restore",
      sequence: 2,
      operation: classOp,
    });
    const journal = [entry, entry2, entry3].reduce(appendEntry, createJournal());

    const serialized = serializeJournal(journal);
    expect(serialized.length).toBeGreaterThan(0);

    const result = deserializeJournal(serialized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries).toHaveLength(3);
      expect(result.data.entries[0]?.id).toBe("je-restore-01");
      expect(result.data.entries[2]?.id).toBe("je-restore-03");
    }
  });
});
