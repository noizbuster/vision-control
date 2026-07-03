import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

const INDEX = z.number().int().nonnegative();

/**
 * Insert a new element as a child of `parent` at `index`. `element` carries the
 * fresh runtime id of the inserted node; `tagName` and optional `attributes`
 * describe it so the inverse (`remove-element`) can identify and the runtime
 * can reconstruct it.
 *
 * Inverse (`computeInverse`): `remove-element` targeting the same element,
 * parent, and index. Insert and Remove are mutual inverses.
 */
export const InsertElementOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("insert-element"),
  /** Overridden to optional: insert uses `element`/`parent` as authoritative refs. */
  target: ElementRefSchema.optional(),
  element: ElementRefSchema,
  parent: ElementRefSchema,
  index: INDEX,
  tagName: z.string().min(1),
  attributes: z.record(z.string(), z.string()).optional(),
});

export type InsertElementOperation = z.infer<typeof InsertElementOperationSchema>;
