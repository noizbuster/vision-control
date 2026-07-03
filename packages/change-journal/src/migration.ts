import { computeInverse, type Operation, OperationSchema } from "@vision-control/change-ir";
import { z } from "zod";

import {
  type ElementSnapshot,
  ElementSnapshotSchema,
  type JournalEntry,
  JournalEntrySchema,
} from "./journal.js";

/**
 * v1 → v2 status mapping. v1 used `"pending" | "committed" | "rolled-back"`; the
 * PRD §12.1 enum is `"preview" | "committed" | "superseded" | "reverted"`.
 * `"pending"` (commit state unknown / preview active) maps to `"preview"`; the
 * terminal undo state `"rolled-back"` maps to `"reverted"`. `"committed"` is
 * unchanged. `"superseded"` has no v1 equivalent and is never produced by
 * migration.
 */
const V1_STATUS_MAP = {
  pending: "preview",
  committed: "committed",
  "rolled-back": "reverted",
} as const;

/**
 * Permissive reader for the v1 JournalEntry shape (old status enum, ad-hoc
 * `z.unknown()` snapshots, no transaction/actor/inverse/preconditions/evidence
 * fields). Used by {@link migrateJournalEntry_v1_to_v2}. `passthrough` keeps
 * any extra keys so a v1 entry that already carries v2-adjacent data (e.g. a
 * `transactionId`) is preserved.
 */
const V1_JOURNAL_ENTRY_READER = z
  .object({
    id: z.string(),
    changeSetId: z.string().optional(),
    operation: OperationSchema,
    appliedAt: z.number().int().nonnegative().optional(),
    status: z.enum(["pending", "committed", "rolled-back"]),
    beforeSnapshot: z.unknown().optional(),
    afterSnapshot: z.unknown().optional(),
  })
  .passthrough();

/**
 * Normalize an unknown v1 snapshot into a typed v2 {@link ElementSnapshot}
 * (or `null` when absent). v1 snapshots were ad-hoc objects (e.g.
 * `{ color: "red" }`); when one lacks a `runtimeId`, it is preserved as
 * passthrough payload on a placeholder-id snapshot so no captured data is lost.
 * Non-object values and `null`/`undefined` collapse to `null`.
 */
const normalizeV1Snapshot = (raw: unknown): ElementSnapshot | null => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.runtimeId === "string") {
    const parsed = ElementSnapshotSchema.safeParse(obj);
    return parsed.success ? parsed.data : null;
  }
  const wrapped = ElementSnapshotSchema.parse({ runtimeId: "<unknown>", ...obj });
  return wrapped;
};

/**
 * Migrate a v1 (old status enum + `z.unknown()` snapshots + no stored inverse)
 * JournalEntry JSON document to a valid v2 PRD §12.1 entry. The stored inverse
 * is computed via `computeInverse(operation)` (it was not carried in v1); the
 * status is mapped through {@link V1_STATUS_MAP}; ad-hoc snapshots are
 * normalized. The result is re-validated through {@link JournalEntrySchema} so a
 * malformed v1 document surfaces as a Zod error, not a silently-broken v2 entry.
 */
export const migrateJournalEntry_v1_to_v2 = (v1Json: unknown): JournalEntry => {
  const v1 = V1_JOURNAL_ENTRY_READER.parse(v1Json);
  const operation: Operation = v1.operation;
  const appliedAt = v1.appliedAt ?? 0;
  const status = V1_STATUS_MAP[v1.status];
  return JournalEntrySchema.parse({
    id: v1.id,
    changeSetId: v1.changeSetId ?? "unknown-cs",
    transactionId: `migrated:${v1.id}`,
    sequence: 0,
    createdAt: appliedAt,
    actor: "system",
    operation,
    inverse: computeInverse(operation),
    preconditions: [],
    evidence: [],
    appliedAt,
    status,
    beforeSnapshot: normalizeV1Snapshot(v1.beforeSnapshot),
    afterSnapshot: normalizeV1Snapshot(v1.afterSnapshot),
  });
};
