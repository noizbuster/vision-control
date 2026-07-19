import {
  computeInverse,
  OPERATION_ID_PATTERN,
  type Operation,
  OperationSchema,
} from "@vision-control/change-ir";
import { z } from "zod";

export const JournalEntryIdSchema = z.string().regex(OPERATION_ID_PATTERN);

export const JournalEntryStatusSchema = z.enum(["preview", "committed", "superseded", "reverted"]);
export type JournalEntryStatus = z.infer<typeof JournalEntryStatusSchema>;

export const ActorSchema = z.enum(["human", "agent", "system"]);
export type Actor = z.infer<typeof ActorSchema>;

export const RuntimeAssertionSchema = z.looseObject({ description: z.string() });
export type RuntimeAssertion = z.infer<typeof RuntimeAssertionSchema>;

export const EvidenceRefSchema = z.looseObject({
  kind: z.string().min(1),
  artifactId: z.string().min(1),
  capturedAt: z.number().int().nonnegative(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const ElementSnapshotSchema = z.looseObject({
  runtimeId: z.string(),
  tagName: z.string().optional(),
  computedStyle: z.record(z.string(), z.string()).default({}),
  attributes: z.record(z.string(), z.string()).default({}),
  classes: z.array(z.string()).default([]),
  textContent: z.string().nullable().optional(),
});
export type ElementSnapshot = z.infer<typeof ElementSnapshotSchema>;

export const JournalEntrySchema = z.object({
  id: JournalEntryIdSchema,
  changeSetId: JournalEntryIdSchema,
  transactionId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  actor: ActorSchema,
  operation: OperationSchema,
  inverse: OperationSchema,
  preconditions: z.array(RuntimeAssertionSchema).default([]),
  evidence: z.array(EvidenceRefSchema).default([]),
  appliedAt: z.number().int().nonnegative(),
  status: JournalEntryStatusSchema,
  beforeSnapshot: ElementSnapshotSchema.nullable(),
  afterSnapshot: ElementSnapshotSchema.nullable(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

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
  readonly inverse?: Operation;
}

const normalizeSnapshot = (
  snapshot: z.input<typeof ElementSnapshotSchema> | null | undefined,
): ElementSnapshot | null => {
  if (snapshot === null || snapshot === undefined) return null;
  return ElementSnapshotSchema.parse(snapshot);
};

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
