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

/**
 * Commit status of a journal entry, mirroring the PRD §12.1 transaction
 * lifecycle. The journal NEVER marks an entry "committed" unless the preview
 * transaction for that entry ended in commit.
 *
 * - "preview": preview transaction still active or commit state unknown.
 * - "committed": preview transaction ended in commit (the edit is live).
 * - "superseded": another entry has superseded this one (merge/supersede).
 * - "reverted": the entry was undone (the stored inverse was applied).
 */
export const JournalEntryStatusSchema = z.enum(["preview", "committed", "superseded", "reverted"]);

export type JournalEntryStatus = z.infer<typeof JournalEntryStatusSchema>;

/** Who or what produced the recorded operation (PRD §12.1 `actor`). */
export const ActorSchema = z.enum(["human", "agent", "system"]);
export type Actor = z.infer<typeof ActorSchema>;

/**
 * One runtime precondition that held when the entry was recorded (PRD §12.1).
 * Structurally mirrors `VerificationAssertion` from change-ir but is defined
 * locally to keep change-journal free of a cross-package type coupling (same
 * decoupling decision change-ir makes for context types). `passthrough` lets
 * the verification engine attach richer structured data without a schema bump.
 */
export const RuntimeAssertionSchema = z.object({ description: z.string() }).passthrough();
export type RuntimeAssertion = z.infer<typeof RuntimeAssertionSchema>;

/**
 * A reference to a captured evidence artifact backing the entry (PRD §12.1
 * `evidence`). `kind` discriminates the evidence class (e.g. `"screenshot"`,
 * `"dom-snapshot"`); `artifactId` locates it in the artifact store (ADR-005,
 * ADR-011); `capturedAt` is epoch millis. `passthrough` is forward-compatible.
 */
export const EvidenceRefSchema = z
  .object({
    kind: z.string().min(1),
    artifactId: z.string().min(1),
    capturedAt: z.number().int().nonnegative(),
  })
  .passthrough();
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

/**
 * A typed snapshot of an element's runtime state at capture time. Replaces the
 * previous `z.unknown()` snapshot fields with a structured, forward-compatible
 * shape: known fields (`runtimeId`, `computedStyle`, `attributes`, `classes`,
 * `textContent`) plus `passthrough` for engine-specific extras. `null` when no
 * snapshot was captured.
 */
export const ElementSnapshotSchema = z
  .object({
    runtimeId: z.string(),
    tagName: z.string().optional(),
    computedStyle: z.record(z.string(), z.string()).default({}),
    attributes: z.record(z.string(), z.string()).default({}),
    classes: z.array(z.string()).default([]),
    textContent: z.string().nullable().optional(),
  })
  .passthrough();
export type ElementSnapshot = z.infer<typeof ElementSnapshotSchema>;

/**
 * One recorded operation in the event-sourced journal (PRD §12.1). Carries the
 * operation AND its inverse — the inverse is STORED at record time, never
 * recomputed at undo time (PRD §12.1: "event and inverse event together").
 * Also carries the transaction it belongs to, the recording actor, the runtime
 * preconditions that held, evidence references, typed before/after snapshots,
 * and the commit status.
 */
export const JournalEntrySchema = z.object({
  id: ID,
  changeSetId: ID,
  transactionId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  /** Epoch millis (PRD sketches `string`; the journal keeps the epoch-ms convention every consumer uses). */
  createdAt: z.number().int().nonnegative(),
  actor: ActorSchema,
  operation: OperationSchema,
  /** Stored inverse; undo applies THIS, never a recomputed value. */
  inverse: OperationSchema,
  preconditions: z.array(RuntimeAssertionSchema).default([]),
  evidence: z.array(EvidenceRefSchema).default([]),
  appliedAt: z.number().int().nonnegative(),
  status: JournalEntryStatusSchema,
  beforeSnapshot: ElementSnapshotSchema.nullable(),
  afterSnapshot: ElementSnapshotSchema.nullable(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const UndoRedoStacksSchema = z.object({
  undo: z.array(ID),
  redo: z.array(ID),
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
  return { entries, stacks: journal.stacks };
};

/** Reset the journal to empty (clears entries and both stacks). */
export const clear = (): Journal => createJournal();

export interface CreateJournalEntryOptions {
  readonly id: string;
  readonly changeSetId: string;
  readonly transactionId: string;
  readonly sequence: number;
  readonly operation: Operation;
  readonly actor?: Actor;
  readonly createdAt?: number;
  readonly appliedAt?: number;
  readonly status?: JournalEntryStatus;
  readonly beforeSnapshot?: z.input<typeof ElementSnapshotSchema> | null;
  readonly afterSnapshot?: z.input<typeof ElementSnapshotSchema> | null;
  readonly preconditions?: readonly RuntimeAssertion[];
  readonly evidence?: readonly EvidenceRef[];
  /** Override the computed inverse (defaults to `computeInverse(operation)`). */
  readonly inverse?: Operation;
}

const normalizeSnapshot = (
  snapshot: z.input<typeof ElementSnapshotSchema> | null | undefined,
): ElementSnapshot | null => {
  if (snapshot === null || snapshot === undefined) return null;
  return ElementSnapshotSchema.parse(snapshot);
};

/**
 * Construct a {@link JournalEntry}, computing and STORE the inverse at record
 * time via `computeInverse` (PRD §12.1). This is the canonical way to build an
 * entry; it enforces the stored-inverse invariant the undo path relies on.
 * `actor` defaults to `"system"`, `status` to `"preview"`, snapshots to `null`
 * (parsed through {@link ElementSnapshotSchema} so defaulted fields are filled),
 * and the assertion/evidence arrays to empty.
 */
export const createJournalEntry = (options: CreateJournalEntryOptions): JournalEntry => {
  const createdAt = options.createdAt ?? Date.now();
  return {
    id: options.id,
    changeSetId: options.changeSetId,
    transactionId: options.transactionId,
    sequence: options.sequence,
    createdAt,
    actor: options.actor ?? "system",
    operation: options.operation,
    inverse: options.inverse ?? computeInverse(options.operation),
    preconditions: options.preconditions ? [...options.preconditions] : [],
    evidence: options.evidence ? [...options.evidence] : [],
    appliedAt: options.appliedAt ?? createdAt,
    status: options.status ?? "preview",
    beforeSnapshot: normalizeSnapshot(options.beforeSnapshot),
    afterSnapshot: normalizeSnapshot(options.afterSnapshot),
  };
};
