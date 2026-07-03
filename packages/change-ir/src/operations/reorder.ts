import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

const INDEX = z.number().int().nonnegative();

/**
 * Move a child within the same parent from `fromIndex` to `toIndex`.
 *
 * Semantics (array model): "remove the element at `fromIndex`, then insert it
 * at `toIndex`". For input `[a, b, c, d]`, `reorder-child` with `fromIndex: 2`
 * and `toIndex: 0` produces `[c, a, b, d]`.
 *
 * Inverse (`computeInverse`): swap `fromIndex` and `toIndex`. Under the
 * remove-then-insert model, applying the inverse removes the element now at
 * `toIndex` and reinserts it at `fromIndex`, restoring the original order. The
 * permutation-consistency test (apply N reorders then their N inverses in
 * reverse order) verifies this returns to the original array.
 */
export const ReorderChildOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("reorder-child"),
  /** Overridden to optional: reorder uses `parent`/`child` as authoritative refs. */
  target: ElementRefSchema.optional(),
  parent: ElementRefSchema,
  child: ElementRefSchema,
  fromIndex: INDEX,
  toIndex: INDEX,
});

export type ReorderChildOperation = z.infer<typeof ReorderChildOperationSchema>;
