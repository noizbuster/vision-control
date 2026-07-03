import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

const INDEX = z.number().int().nonnegative();

/**
 * Remove `element` from `parent` at `index`. `tagName` and optional `attributes`
 * are carried so the inverse (`insert-element`) can reconstruct the node.
 *
 * Inverse (`computeInverse`): `insert-element` re-inserting the same element at
 * the same parent and index. Remove and Insert are mutual inverses.
 */
export const RemoveElementOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("remove-element"),
  /** Overridden to optional: remove uses `element`/`parent` as authoritative refs. */
  target: ElementRefSchema.optional(),
  element: ElementRefSchema,
  parent: ElementRefSchema,
  index: INDEX,
  tagName: z.string().min(1),
  attributes: z.record(z.string(), z.string()).optional(),
});

export type RemoveElementOperation = z.infer<typeof RemoveElementOperationSchema>;
