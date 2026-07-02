import { z } from "zod";
import { OPERATION_ID_PATTERN } from "./operation-base.js";
import { type Operation, OperationSchema } from "./operations/index.js";

const ID = z.string().regex(OPERATION_ID_PATTERN);

/**
 * A ChangeSet is the unit of grouped visual operations for one editing session.
 * Operations are append-only; `committed` marks the set as finalized for
 * source resolution, and `supersededBy` marks it as replaced by a newer set.
 */
export const ChangeSetSchema = z.object({
  id: ID,
  sessionId: ID,
  operations: z.array(OperationSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  committed: z.boolean(),
  /** Present when another changeset has superseded this one (merge/supersede). */
  supersededBy: ID.optional(),
});

export type ChangeSet = z.infer<typeof ChangeSetSchema>;

export interface CreateChangeSetOptions {
  readonly sessionId: string;
  readonly id?: string;
  readonly now?: number;
}

/**
 * Create an empty, uncommitted ChangeSet. `id` and `now` default to a fresh
 * UUID and `Date.now()`; pass them explicitly for deterministic tests.
 */
export const createChangeSet = (options: CreateChangeSetOptions): ChangeSet => {
  const now = options.now ?? Date.now();
  return {
    id: options.id ?? crypto.randomUUID(),
    sessionId: options.sessionId,
    operations: [],
    createdAt: now,
    updatedAt: now,
    committed: false,
  };
};

/** Append an operation and bump `updatedAt`. Does not mutate the input. */
export const appendOperation = (cs: ChangeSet, op: Operation): ChangeSet => ({
  ...cs,
  operations: [...cs.operations, op],
  updatedAt: Date.now(),
});

/** Remove an operation by id and bump `updatedAt`. Does not mutate the input. */
export const removeOperation = (cs: ChangeSet, opId: string): ChangeSet => ({
  ...cs,
  operations: cs.operations.filter((op) => op.id !== opId),
  updatedAt: Date.now(),
});

const newOperationId = (): string => crypto.randomUUID();

/**
 * Compute the operation that undoes `op`.
 *
 * The returned operation carries a fresh `id`, `inverseOf: op.id` (linking the
 * inverse back to the original), and a fresh `timestamp`. The `runtime` flag is
 * PRESERVED: the inverse of a runtime preview mutation is itself a preview
 * mutation — undoing a transform preview does not turn it into source intent
 * (PRD §12.5, Appendix D.1).
 *
 * Every operation kind has a defined inverse; the switch is exhaustive. Adding
 * a kind without an inverse branch is a compile error (the `default` becomes
 * reachable).
 */
export const computeInverse = (op: Operation): Operation => {
  const base = {
    id: newOperationId(),
    inverseOf: op.id,
    timestamp: Date.now(),
    runtime: op.runtime,
  };
  switch (op.kind) {
    case "style-edit":
      return {
        ...base,
        kind: "style-edit",
        target: op.target,
        property: op.property,
        // previousValue is required for a lossless inverse; the journal always
        // captures it. Fall back to "" for ops constructed without it.
        value: op.previousValue ?? "",
        important: op.important,
        previousValue: op.value,
      };
    case "text-edit":
      return {
        ...base,
        kind: "text-edit",
        target: op.target,
        newText: op.previousText ?? "",
        previousText: op.newText,
      };
    case "class-add":
      return { ...base, kind: "class-remove", target: op.target, className: op.className };
    case "class-remove":
      return { ...base, kind: "class-add", target: op.target, className: op.className };
    case "class-replace":
      return {
        ...base,
        kind: "class-replace",
        target: op.target,
        oldClassName: op.newClassName,
        newClassName: op.oldClassName,
      };
    case "reorder-child":
      return {
        ...base,
        kind: "reorder-child",
        parent: op.parent,
        child: op.child,
        fromIndex: op.toIndex,
        toIndex: op.fromIndex,
      };
    case "reparent-element":
      return {
        ...base,
        kind: "reparent-element",
        element: op.element,
        sourceParent: op.targetParent,
        sourceIndex: op.targetIndex,
        targetParent: op.sourceParent,
        targetIndex: op.sourceIndex,
      };
    case "resize-element":
      return {
        ...base,
        kind: "resize-element",
        element: op.element,
        property: op.property,
        fromValue: op.toValue,
        toValue: op.fromValue,
        unit: op.unit,
      };
    default: {
      // Exhaustiveness guard: a new kind without a branch is a compile error.
      const exhaustive: never = op;
      throw new Error(`computeInverse: unhandled operation kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};
