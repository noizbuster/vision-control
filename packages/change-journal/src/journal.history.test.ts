import { computeInverse, type Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  createJournal,
  createJournalEntry,
  JournalEntrySchema,
  peekRedo,
  peekUndo,
  redo,
  StaleInverseError,
  undo,
} from "./index.js";
import { journalEntry, styleEditOperation } from "./journal-test-fixtures.js";

describe("journal entry schema", () => {
  it("accepts a valid entry", () => {
    expect(
      JournalEntrySchema.safeParse(journalEntry("je-entry-0001", styleEditOperation("op-je-00001")))
        .success,
    ).toBe(true);
  });

  it("rejects a bad status", () => {
    const valid = journalEntry("je-entry-0002", styleEditOperation("op-je-00002"));
    expect(JournalEntrySchema.safeParse({ ...valid, status: "garbage" }).success).toBe(false);
  });

  it("rejects an invalid inverse", () => {
    const valid = journalEntry("je-entry-0003", styleEditOperation("op-je-00003"));
    expect(
      JournalEntrySchema.safeParse({ ...valid, inverse: { kind: "not-a-real-kind" } }).success,
    ).toBe(false);
  });
});

describe("createJournalEntry", () => {
  it("stores the inverse at record time", () => {
    const operation = styleEditOperation("op-je-store01");
    const entry = createJournalEntry({
      id: "je-store-0001",
      changeSetId: "cs-1",
      transactionId: "tx-1",
      sequence: 0,
      operation,
    });
    const direct = computeInverse(operation);
    expect(entry.inverse.inverseOf).toBe(operation.id);
    expect(entry.inverse.kind).toBe(direct.kind);
    if (entry.inverse.kind !== "style-edit" || direct.kind !== "style-edit") return;
    expect(entry.inverse.value).toBe(direct.value);
    expect(entry.inverse.previousValue).toBe(direct.previousValue);
    expect(entry.inverse.important).toBe(direct.important);
  });

  it("uses the documented defaults", () => {
    const entry = createJournalEntry({
      id: "je-store-0002",
      changeSetId: "cs-1",
      transactionId: "tx-1",
      sequence: 0,
      operation: styleEditOperation("op-je-store02"),
    });
    expect(entry.actor).toBe("system");
    expect(entry.status).toBe("preview");
    expect(entry.beforeSnapshot).toBeNull();
    expect(entry.afterSnapshot).toBeNull();
    expect(entry.preconditions).toEqual([]);
    expect(entry.evidence).toEqual([]);
  });
});

describe("journal history stacks", () => {
  it("starts empty", () => {
    const empty = createJournal();
    expect(empty.entries).toHaveLength(0);
    expect(canUndoJournal(empty)).toBe(false);
    expect(canRedoJournal(empty)).toBe(false);
  });

  it("appends to undo", () => {
    const journal = appendEntry(
      createJournal(),
      journalEntry("je-entry-e1", styleEditOperation("op-je-entrye1")),
    );
    expect(journal.entries).toHaveLength(1);
    expect(canUndoJournal(journal)).toBe(true);
    expect(canRedoJournal(journal)).toBe(false);
    expect(peekUndo(journal)).toBe("je-entry-e1");
  });

  it("clears redo when a new operation is appended", () => {
    let journal = appendEntry(
      createJournal(),
      journalEntry("je-entry-aa", styleEditOperation("op-je-entryaa")),
    );
    journal = undo(journal).journal;
    expect(canRedoJournal(journal)).toBe(true);
    expect(canUndoJournal(journal)).toBe(false);
    journal = appendEntry(
      journal,
      journalEntry("je-entry-bb", styleEditOperation("op-je-entrybb")),
    );
    expect(canRedoJournal(journal)).toBe(false);
    expect(canUndoJournal(journal)).toBe(true);
    expect(peekRedo(journal)).toBeUndefined();
  });
});

describe("undo and redo", () => {
  it("returns the stored inverse and marks the entry reverted", () => {
    const operation = styleEditOperation("op-je-entryu1");
    const journal = appendEntry(createJournal(), journalEntry("je-entry-u1", operation));
    const undone = undo(journal);
    expect(undone.inverse.inverseOf).toBe(operation.id);
    expect(canUndoJournal(undone.journal)).toBe(false);
    expect(canRedoJournal(undone.journal)).toBe(true);
    expect(undone.journal.entries.find((entry) => entry.id === "je-entry-u1")?.status).toBe(
      "reverted",
    );
  });

  it("rejects empty undo requests", () => {
    expect(() => undo(createJournal())).toThrow(/undo stack is empty/);
  });

  it("rejects non-top undo requests", () => {
    const journal = appendEntry(
      createJournal(),
      journalEntry("je-entry-top", styleEditOperation("op-je-entrytp")),
    );
    expect(() => undo(journal, "je-other-id")).toThrow(/not the top/);
  });

  it("returns the original operation on redo", () => {
    const initial = appendEntry(
      createJournal(),
      journalEntry("je-entry-r1", styleEditOperation("op-je-entryr1")),
    );
    const redone = redo(undo(initial).journal);
    expect(redone.operation.id).toBe("op-je-entryr1");
    expect(canUndoJournal(redone.journal)).toBe(true);
    expect(canRedoJournal(redone.journal)).toBe(false);
    expect(redone.journal.entries.find((entry) => entry.id === "je-entry-r1")?.status).toBe(
      "committed",
    );
  });

  it("rejects redo when the stack is empty", () => {
    const journal = appendEntry(
      createJournal(),
      journalEntry("je-entry-r2", styleEditOperation("op-je-entryr2")),
    );
    expect(() => redo(journal)).toThrow(/redo stack is empty/);
  });

  it("round-trips state through stored inverse and original operation", () => {
    type StyleState = Readonly<Record<string, string>>;
    const apply = (state: StyleState, operation: Operation): StyleState =>
      operation.kind === "style-edit" ? { ...state, [operation.property]: operation.value } : state;
    const initial: StyleState = { color: "red" };
    const operation = styleEditOperation("op-je-roundtr");
    const journal = appendEntry(createJournal(), journalEntry("je-entry-rt", operation));
    const applied = apply(initial, operation);
    const undone = undo(journal);
    expect(apply(applied, undone.inverse)).toEqual(initial);
    expect(apply(initial, redo(undone.journal).operation).color).toBe("blue");
  });

  it("returns the same inverse semantics as computeInverse", () => {
    const operation = styleEditOperation("op-je-consist");
    const inverse = undo(
      appendEntry(createJournal(), journalEntry("je-entry-cs", operation)),
    ).inverse;
    const direct = computeInverse(operation);
    expect(inverse.inverseOf).toBe(direct.inverseOf);
    expect(inverse.kind).toBe(direct.kind);
    expect(inverse.runtime).toBe(direct.runtime);
    if (inverse.kind !== "style-edit" || direct.kind !== "style-edit") return;
    expect(inverse.property).toBe(direct.property);
    expect(inverse.value).toBe(direct.value);
    expect(inverse.previousValue).toBe(direct.previousValue);
    expect(inverse.important).toBe(direct.important);
  });

  it("throws StaleInverseError for a corrupt stored inverse", () => {
    const entry = journalEntry("je-entry-stale", styleEditOperation("op-je-stale01"));
    Reflect.set(entry, "inverse", { kind: "not-real" });
    const journal = appendEntry(createJournal(), entry);
    expect(() => undo(journal)).toThrow(StaleInverseError);
  });
});
