import { computeInverse, type Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  clear,
  createJournal,
  type JournalEntry,
  JournalEntrySchema,
  peekRedo,
  peekUndo,
  redo,
  undo,
} from "./index.js";

const BASE_TIME = 1_700_000_000_000;

const styleEditOp = (id: string): Operation => ({
  id,
  timestamp: BASE_TIME,
  runtime: false,
  kind: "style-edit",
  target: { runtimeId: "btn-1" },
  property: "color",
  value: "blue",
  important: false,
  previousValue: "red",
});

const entry = (
  id: string,
  op: Operation,
  status: JournalEntry["status"] = "applied",
): JournalEntry => ({
  id,
  changeSetId: "csjournal001",
  operation: op,
  appliedAt: BASE_TIME,
  status,
  beforeSnapshot: { color: "red" },
  afterSnapshot: { color: "blue" },
});

describe("journal entry schema", () => {
  it("accepts a valid entry", () => {
    expect(
      JournalEntrySchema.safeParse(entry("je-entry-0001", styleEditOp("op-je-00001"))).success,
    ).toBe(true);
  });

  it("rejects an entry with a bad status", () => {
    const bad = { ...entry("je-entry-0002", styleEditOp("op-je-00002")), status: "garbage" };
    expect(JournalEntrySchema.safeParse(bad).success).toBe(false);
  });
});

describe("appendEntry and stack invariants", () => {
  it("createJournal starts empty with nothing undoable/redoable", () => {
    const j = createJournal();
    expect(j.entries).toHaveLength(0);
    expect(canUndoJournal(j)).toBe(false);
    expect(canRedoJournal(j)).toBe(false);
  });

  it("appendEntry pushes onto the undo stack", () => {
    const j = appendEntry(createJournal(), entry("je-entry-e1", styleEditOp("op-je-entrye1")));
    expect(j.entries).toHaveLength(1);
    expect(canUndoJournal(j)).toBe(true);
    expect(canRedoJournal(j)).toBe(false);
    expect(peekUndo(j)).toBe("je-entry-e1");
  });

  it("a NEW operation clears the redo stack (standard undo/redo)", () => {
    let j = appendEntry(createJournal(), entry("je-entry-aa", styleEditOp("op-je-entryaa")));
    j = undo(j).journal;
    // After undo: redo stack holds the entry, undo is empty.
    expect(canRedoJournal(j)).toBe(true);
    expect(canUndoJournal(j)).toBe(false);
    // Append a new entry: redo must be cleared.
    j = appendEntry(j, entry("je-entry-bb", styleEditOp("op-je-entrybb")));
    expect(canRedoJournal(j)).toBe(false);
    expect(canUndoJournal(j)).toBe(true);
    expect(peekRedo(j)).toBeUndefined();
  });
});

describe("undo / redo", () => {
  it("undo returns the inverse and moves the entry to the redo stack", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-u1", styleEditOp("op-je-entryu1")));
    const { journal: j1, inverse } = undo(j0);
    expect(inverse.id).not.toBe("op-je-entryu1");
    expect(inverse.inverseOf).toBe("op-je-entryu1");
    expect(canUndoJournal(j1)).toBe(false);
    expect(canRedoJournal(j1)).toBe(true);
    const rolled = j1.entries.find((e) => e.id === "je-entry-u1");
    expect(rolled?.status).toBe("rolled-back");
  });

  it("undo throws when the undo stack is empty", () => {
    expect(() => undo(createJournal())).toThrow(/undo stack is empty/);
  });

  it("undo throws when entryId is not the top of the undo stack", () => {
    const j = appendEntry(createJournal(), entry("je-entry-top", styleEditOp("op-je-entrytp")));
    expect(() => undo(j, "je-other-id")).toThrow(/not the top/);
  });

  it("redo returns the operation and moves the entry back to the undo stack", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-r1", styleEditOp("op-je-entryr1")));
    const { journal: j1 } = undo(j0);
    const { journal: j2, operation } = redo(j1);
    expect(operation.id).toBe("op-je-entryr1");
    expect(canUndoJournal(j2)).toBe(true);
    expect(canRedoJournal(j2)).toBe(false);
    const reapplied = j2.entries.find((e) => e.id === "je-entry-r1");
    expect(reapplied?.status).toBe("applied");
  });

  it("redo throws when the redo stack is empty", () => {
    const j = appendEntry(createJournal(), entry("je-entry-r2", styleEditOp("op-je-entryr2")));
    expect(() => redo(j)).toThrow(/redo stack is empty/);
  });
});

describe("undo/redo model round-trip restores and re-applies", () => {
  type StyleState = Record<string, string>;
  const apply = (state: StyleState, op: Operation): StyleState => {
    if (op.kind === "style-edit") return { ...state, [op.property]: op.value };
    return state;
  };

  it("apply op -> undo (apply inverse) -> redo (re-apply op)", () => {
    const initial: StyleState = { color: "red" };
    const op = styleEditOp("op-je-roundtr");
    const j0 = appendEntry(createJournal(), entry("je-entry-rt", op));

    // Apply the recorded operation.
    let state = apply(initial, op);
    expect(state.color).toBe("blue");

    // Undo: apply the inverse.
    const undone = undo(j0);
    state = apply(state, undone.inverse);
    expect(state).toEqual(initial);

    // Redo: re-apply the original operation.
    const redone = redo(undone.journal);
    state = apply(state, redone.operation);
    expect(state.color).toBe("blue");
  });

  it("the journal's inverse is structurally equal to change-ir computeInverse", () => {
    const op = styleEditOp("op-je-consist");
    const j = appendEntry(createJournal(), entry("je-entry-cs", op));
    const { inverse } = undo(j);
    const direct = computeInverse(op);
    // id and timestamp are freshly generated on each computeInverse call, so
    // compare every other field (the meaningful inverse semantics).
    expect(inverse.inverseOf).toBe(direct.inverseOf);
    expect(inverse.kind).toBe(direct.kind);
    expect(inverse.runtime).toBe(direct.runtime);
    if (inverse.kind === "style-edit" && direct.kind === "style-edit") {
      expect(inverse.property).toBe(direct.property);
      expect(inverse.value).toBe(direct.value);
      expect(inverse.previousValue).toBe(direct.previousValue);
      expect(inverse.important).toBe(direct.important);
    }
  });
});

describe("clear", () => {
  it("resets the journal to empty", () => {
    const cleared = clear();
    expect(cleared.entries).toHaveLength(0);
    expect(canUndoJournal(cleared)).toBe(false);
  });
});
