import {
  computeInverse,
  OPERATION_ID_PATTERN,
  type Operation,
  OperationSchema,
} from "@vision-control/change-ir";
import { z } from "zod";

import {
  canRedo,
  canUndo,
  createStacks,
  pushAppliedClearingRedo,
  transferRedoToUndo,
  transferUndoToRedo,
  type UndoRedoStacks,
} from "./stacks.js";

const ID = z.string().regex(OPERATION_ID_PATTERN);

export const JournalEntryStatusSchema = z.enum(["pending", "applied", "rolled-back"]);

export type JournalEntryStatus = z.infer<typeof JournalEntryStatusSchema>;

/**
 * One recorded operation in the event-sourced journal. Carries the operation,
 * its apply status, before/after snapshots (typed `unknown` until the snapshot
 * format lands in a later task), and links back to its changeset.
 *
 * The inverse of the operation is NOT stored on the entry — it is computed on
 * demand via {@link undo}, which delegates to `computeInverse` from change-ir.
 * Storing the inverse separately would duplicate the source of truth.
 */
export const JournalEntrySchema = z.object({
  id: ID,
  changeSetId: ID,
  operation: OperationSchema,
  appliedAt: z.number().int().nonnegative(),
  status: JournalEntryStatusSchema,
  beforeSnapshot: z.unknown(),
  afterSnapshot: z.unknown(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/**
 * Immutable journal state: the recorded entries plus the undo/redo stacks of
 * entry ids. All journal functions return a new Journal; none mutate.
 */
export interface Journal {
  readonly entries: readonly JournalEntry[];
  readonly stacks: UndoRedoStacks;
}

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

export interface UndoOutcome {
  readonly journal: Journal;
  /** The inverse operation the caller should apply to the runtime/source. */
  readonly inverse: Operation;
}

/**
 * Undo an entry: validate it is the current top of the undo stack, move it to
 * the redo stack, mark it rolled-back, and return the inverse operation to
 * apply. If `entryId` is omitted, undoes the current top.
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
  const { stacks } = transferUndoToRedo(journal.stacks);
  const entries = journal.entries.map((e) =>
    e.id === target ? { ...e, status: "rolled-back" as const } : e,
  );
  return { journal: { entries, stacks }, inverse: computeInverse(entry.operation) };
};

export interface RedoOutcome {
  readonly journal: Journal;
  /** The original operation the caller should re-apply to the runtime/source. */
  readonly operation: Operation;
}

/**
 * Redo an entry: validate it is the current top of the redo stack, move it back
 * to the undo stack, mark it applied, and return the operation to re-apply.
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
    e.id === target ? { ...e, status: "applied" as const } : e,
  );
  return { journal: { entries, stacks }, operation: entry.operation };
};

/** Reset the journal to empty (clears entries and both stacks). */
export const clear = (): Journal => createJournal();
