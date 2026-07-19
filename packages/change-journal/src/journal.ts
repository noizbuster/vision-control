import { type Operation, OperationSchema } from "@vision-control/change-ir";
import { z } from "zod";

import {
  type JournalEntry,
  JournalEntryIdSchema,
  JournalEntrySchema,
  type JournalEntryStatus,
} from "./entry.js";
import {
  canRedo,
  canUndo,
  createStacks,
  pushAppliedClearingRedo,
  transferRedoToUndo,
  transferUndoToRedo,
  type UndoRedoStacks,
} from "./stacks.js";

export {
  type Actor,
  ActorSchema,
  type CreateJournalEntryOptions,
  createJournalEntry,
  type ElementSnapshot,
  ElementSnapshotSchema,
  type EvidenceRef,
  EvidenceRefSchema,
  type JournalEntry,
  JournalEntrySchema,
  type JournalEntryStatus,
  JournalEntryStatusSchema,
  type RuntimeAssertion,
  RuntimeAssertionSchema,
} from "./entry.js";

export const UndoRedoStacksSchema = z.object({
  undo: z.array(JournalEntryIdSchema),
  redo: z.array(JournalEntryIdSchema),
});

/**
 * Immutable journal state: the recorded entries plus the undo/redo stacks of
 * entry ids. All journal functions return a new Journal; none mutate.
 */
export interface Journal {
  readonly entries: readonly JournalEntry[];
  readonly stacks: UndoRedoStacks;
}

export const JournalSchema = z.object({
  entries: z.array(JournalEntrySchema),
  stacks: UndoRedoStacksSchema,
});

export const createJournal = (): Journal => ({ entries: [], stacks: createStacks() });

export const canUndoJournal = (journal: Journal): boolean => canUndo(journal.stacks);

export const canRedoJournal = (journal: Journal): boolean => canRedo(journal.stacks);

/** The id of the entry that undo() would act on, or undefined. */
export const peekUndo = (journal: Journal): string | undefined =>
  journal.stacks.undo[journal.stacks.undo.length - 1];

/** The id of the entry that redo() would act on, or undefined. */
export const peekRedo = (journal: Journal): string | undefined =>
  journal.stacks.redo[journal.stacks.redo.length - 1];

/**
 * Append a recorded entry. Pushes the entry onto the undo stack and CLEARS the
 * redo stack (standard undo/redo semantics: a new edit discards redo history).
 */
export const appendEntry = (journal: Journal, entry: JournalEntry): Journal => ({
  entries: [...journal.entries, entry],
  stacks: pushAppliedClearingRedo(journal.stacks, entry.id),
});

export const activeJournalEntries = (entries: readonly JournalEntry[]): readonly JournalEntry[] =>
  entries.filter((entry) => entry.status === "preview" || entry.status === "committed");

export interface UndoOutcome {
  readonly journal: Journal;
  /** The STORED inverse operation the caller should apply to the runtime/source. */
  readonly inverse: Operation;
}

/**
 * Thrown by {@link undo} when the target entry's stored `inverse` is not a
 * valid operation (corrupt or stale persistence). A stored inverse that fails
 * validation must never be silently applied.
 */
export class StaleInverseError extends Error {
  constructor(
    readonly entryId: string,
    override readonly cause: unknown,
  ) {
    super(`undo: entry ${entryId} carries a corrupt/stale inverse that is not a valid Operation`);
    this.name = "StaleInverseError";
  }
}

/**
 * Undo an entry: validate it is the current top of the undo stack, move it to
 * the redo stack, mark it reverted, and return the STORED inverse operation to
 * apply. The inverse is taken from the entry's `inverse` field (PRD §12.1) and
 * re-validated through {@link OperationSchema}; a corrupt/stale stored inverse
 * throws {@link StaleInverseError} rather than silently applying garbage.
 *
 * If `entryId` is omitted, undoes the current top.
 *
 * Throws if the undo stack is empty or `entryId` is not the top — these are
 * programming errors (caller mismanagement), not parse failures.
 */
export const undo = (journal: Journal, entryId?: string): UndoOutcome => {
  const top = peekUndo(journal);
  if (top === undefined) throw new Error("undo: undo stack is empty");
  const target = entryId ?? top;
  if (target !== top) {
    throw new Error(`undo: entry ${target} is not the top of the undo stack (${top})`);
  }
  const entry = journal.entries.find((e) => e.id === target);
  if (entry === undefined) throw new Error(`undo: entry ${target} not found`);
  const inverseParse = OperationSchema.safeParse(entry.inverse);
  if (!inverseParse.success) {
    throw new StaleInverseError(target, inverseParse.error);
  }
  const { stacks } = transferUndoToRedo(journal.stacks);
  const entries = journal.entries.map((e) =>
    e.id === target ? { ...e, status: "reverted" as const } : e,
  );
  return { journal: { entries, stacks }, inverse: inverseParse.data };
};

export interface RedoOutcome {
  readonly journal: Journal;
  /** The original operation the caller should re-apply to the runtime/source. */
  readonly operation: Operation;
}

/**
 * Redo an entry: validate it is the current top of the redo stack, move it back
 * to the undo stack, mark it committed, and return the operation to re-apply.
 *
 * Throws if the redo stack is empty or `entryId` is not the top.
 */
export const redo = (journal: Journal, entryId?: string): RedoOutcome => {
  const top = peekRedo(journal);
  if (top === undefined) throw new Error("redo: redo stack is empty");
  const target = entryId ?? top;
  if (target !== top) {
    throw new Error(`redo: entry ${target} is not the top of the redo stack (${top})`);
  }
  const entry = journal.entries.find((e) => e.id === target);
  if (entry === undefined) throw new Error(`redo: entry ${target} not found`);
  const { stacks } = transferRedoToUndo(journal.stacks);
  const entries = journal.entries.map((e) =>
    e.id === target ? { ...e, status: "committed" as const } : e,
  );
  return { journal: { entries, stacks }, operation: entry.operation };
};

/**
 * Report the commit status of an entry. Throws if the entry id is unknown —
 * that is a caller bug, not a recoverable parse failure.
 */
export const commitStatus = (journal: Journal, entryId: string): JournalEntryStatus => {
  const entry = journal.entries.find((e) => e.id === entryId);
  if (entry === undefined) throw new Error(`commitStatus: entry ${entryId} not found`);
  return entry.status;
};

/**
 * Mark an entry committed. Call this ONLY when the preview transaction for the
 * entry ended in commit — never speculatively. Returns a new Journal.
 */
export const markEntryCommitted = (journal: Journal, entryId: string): Journal => {
  const exists = journal.entries.some((e) => e.id === entryId);
  if (!exists) throw new Error(`markEntryCommitted: entry ${entryId} not found`);
  const entries = journal.entries.map((e) =>
    e.id === entryId ? { ...e, status: "committed" as const } : e,
  );
  return { entries, stacks: journal.stacks };
};

/**
 * Mark an entry reverted. Returns a new Journal. Used when a preview
 * transaction is rolled back outside the standard undo path.
 */
export const markEntryReverted = (journal: Journal, entryId: string): Journal => {
  const exists = journal.entries.some((e) => e.id === entryId);
  if (!exists) throw new Error(`markEntryReverted: entry ${entryId} not found`);
  const entries = journal.entries.map((e) =>
    e.id === entryId ? { ...e, status: "reverted" as const } : e,
  );
  return { entries, stacks: journal.stacks };
};

/**
 * Mark an entry superseded by a newer one (merge/supersede path, PRD §12.1
 * status "superseded"). Returns a new Journal.
 */
export const markEntrySuperseded = (journal: Journal, entryId: string): Journal => {
  const exists = journal.entries.some((e) => e.id === entryId);
  if (!exists) throw new Error(`markEntrySuperseded: entry ${entryId} not found`);
  const entries = journal.entries.map((e) =>
    e.id === entryId ? { ...e, status: "superseded" as const } : e,
  );
  return {
    entries,
    stacks: {
      undo: journal.stacks.undo.filter((id) => id !== entryId),
      redo: journal.stacks.redo.filter((id) => id !== entryId),
    },
  };
};

/** Reset the journal to empty (clears entries and both stacks). */
export const clear = (): Journal => createJournal();
