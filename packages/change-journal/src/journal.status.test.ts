import { describe, expect, it } from "vitest";

import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  clear,
  commitStatus,
  createJournal,
  markEntryCommitted,
  markEntryReverted,
  markEntrySuperseded,
  redo,
  undo,
} from "./index.js";
import { journalEntry, styleEditOperation } from "./journal-test-fixtures.js";

describe("supersede status", () => {
  it("marks an entry superseded", () => {
    const journal = appendEntry(
      createJournal(),
      journalEntry("je-entry-sup1", styleEditOperation("op-je-sup0001")),
    );
    expect(commitStatus(markEntrySuperseded(journal, "je-entry-sup1"), "je-entry-sup1")).toBe(
      "superseded",
    );
  });

  it("removes an applied superseded entry from undo history", () => {
    const first = journalEntry("je-entry-keep", styleEditOperation("op-je-keep001"));
    const target = journalEntry("je-entry-sup2", styleEditOperation("op-je-sup0002"));
    const journal = appendEntry(appendEntry(createJournal(), first), target);

    const superseded = markEntrySuperseded(journal, target.id);

    expect(superseded.stacks).toEqual({ undo: [first.id], redo: [] });
    expect(journal.stacks).toEqual({ undo: [first.id, target.id], redo: [] });
    expect(superseded.stacks).not.toBe(journal.stacks);
    expect(canUndoJournal(superseded)).toBe(true);
  });

  it("removes a reverted superseded entry from redo history", () => {
    const target = journalEntry("je-entry-sup3", styleEditOperation("op-je-sup0003"));
    const reverted = undo(appendEntry(createJournal(), target)).journal;

    const superseded = markEntrySuperseded(reverted, target.id);

    expect(superseded.stacks).toEqual({ undo: [], redo: [] });
    expect(reverted.stacks).toEqual({ undo: [], redo: [target.id] });
    expect(superseded.stacks).not.toBe(reverted.stacks);
    expect(canRedoJournal(superseded)).toBe(false);
  });

  it("rejects an unknown entry", () => {
    expect(() => markEntrySuperseded(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });
});

describe("clear", () => {
  it("resets to empty", () => {
    expect(clear().entries).toHaveLength(0);
    expect(canUndoJournal(clear())).toBe(false);
  });
});

describe("commit status", () => {
  const previewJournal = () =>
    appendEntry(
      createJournal(),
      journalEntry("je-entry-cs1", styleEditOperation("op-je-entrycs1"), "preview"),
    );

  it("reports entry status", () => {
    expect(commitStatus(previewJournal(), "je-entry-cs1")).toBe("preview");
  });

  it("rejects unknown status ids", () => {
    expect(() => commitStatus(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("marks an entry committed", () => {
    const committed = markEntryCommitted(previewJournal(), "je-entry-cs1");
    expect(commitStatus(committed, "je-entry-cs1")).toBe("committed");
    expect(canUndoJournal(committed)).toBe(true);
  });

  it("rejects unknown commit ids", () => {
    expect(() => markEntryCommitted(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("marks an entry reverted", () => {
    expect(commitStatus(markEntryReverted(previewJournal(), "je-entry-cs1"), "je-entry-cs1")).toBe(
      "reverted",
    );
  });

  it("rejects unknown revert ids", () => {
    expect(() => markEntryReverted(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("marks redo committed", () => {
    const initial = appendEntry(
      createJournal(),
      journalEntry("je-entry-rd1", styleEditOperation("op-je-entryrd1")),
    );
    expect(commitStatus(redo(undo(initial).journal).journal, "je-entry-rd1")).toBe("committed");
  });
});
