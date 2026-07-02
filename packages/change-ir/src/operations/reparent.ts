import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

const INDEX = z.number().int().nonnegative();

/**
 * Move an element from one parent to another.
 *
 * Semantics: "remove the element at `sourceIndex` from `sourceParent`, then
 * insert it at `targetIndex` in `targetParent`".
 *
 * Inverse (`computeInverse`): swap the `(sourceParent, sourceIndex)` and
 * `(targetParent, targetIndex)` pairs — move the element back to its original
 * parent and index. The `element` reference is unchanged.
 */
export const ReparentElementOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("reparent-element"),
  element: ElementRefSchema,
  sourceParent: ElementRefSchema,
  sourceIndex: INDEX,
  targetParent: ElementRefSchema,
  targetIndex: INDEX,
});

export type ReparentElementOperation = z.infer<typeof ReparentElementOperationSchema>;
