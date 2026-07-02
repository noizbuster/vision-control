/**
 * Undo/redo stack primitives for the journal.
 *
 * The journal keeps two stacks of entry ids: the undo stack (applied
 * operations, most-recent on top) and the redo stack (rolled-back operations,
 * most-recent on top). The three standard undo/redo invariants live here:
 *
 * 1. `pushAppliedClearingRedo` — appending a NEW operation pushes it onto the
 *    undo stack AND clears the redo stack. A new edit discards redo history.
 * 2. `transferUndoToRedo` — undo pops the top of the undo stack and pushes it
 *    onto the redo stack.
 * 3. `transferRedoToUndo` — redo pops the top of the redo stack and pushes it
 *    onto the undo stack.
 *
 * All functions are pure: they return a new {@link UndoRedoStacks} and never
 * mutate their input.
 */
export interface UndoRedoStacks {
  readonly undo: readonly string[];
  readonly redo: readonly string[];
}

export const createStacks = (): UndoRedoStacks => ({ undo: [], redo: [] });

export const canUndo = (stacks: UndoRedoStacks): boolean => stacks.undo.length > 0;

export const canRedo = (stacks: UndoRedoStacks): boolean => stacks.redo.length > 0;

/** Push an applied entry id onto the undo stack and CLEAR the redo stack. */
export const pushAppliedClearingRedo = (
  stacks: UndoRedoStacks,
  entryId: string,
): UndoRedoStacks => ({
  undo: [...stacks.undo, entryId],
  redo: [],
});

export interface TransferResult {
  readonly stacks: UndoRedoStacks;
  readonly entryId?: string;
}

/**
 * Pop the top of the undo stack and push it onto the redo stack. Returns the
 * transferred entry id, or `undefined` if the undo stack is empty.
 */
export const transferUndoToRedo = (stacks: UndoRedoStacks): TransferResult => {
  const top = stacks.undo[stacks.undo.length - 1];
  if (top === undefined) return { stacks };
  return {
    stacks: { undo: stacks.undo.slice(0, -1), redo: [...stacks.redo, top] },
    entryId: top,
  };
};

/**
 * Pop the top of the redo stack and push it onto the undo stack. Returns the
 * transferred entry id, or `undefined` if the redo stack is empty.
 */
export const transferRedoToUndo = (stacks: UndoRedoStacks): TransferResult => {
  const top = stacks.redo[stacks.redo.length - 1];
  if (top === undefined) return { stacks };
  return {
    stacks: { undo: [...stacks.undo, top], redo: stacks.redo.slice(0, -1) },
    entryId: top,
  };
};
