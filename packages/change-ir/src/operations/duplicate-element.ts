import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

const INDEX = z.number().int().nonnegative();

/**
 * Duplicate `source` into `parent` at `index`, producing a new node referenced
 * by `duplicate`. `tagName` identifies the duplicated node kind.
 *
 * Inverse (`computeInverse`): `remove-element` that removes the `duplicate`
 * node (the copy), leaving the original `source` untouched. The inverse is
 * one-directional: duplicating again would re-create the copy, but the
 * documented undo of a duplicate is to remove the copy.
 */
export const DuplicateElementOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("duplicate-element"),
  /** Overridden to optional: duplicate uses `source`/`duplicate`/`parent`. */
  target: ElementRefSchema.optional(),
  source: ElementRefSchema,
  duplicate: ElementRefSchema,
  parent: ElementRefSchema,
  index: INDEX,
  tagName: z.string().min(1),
});

export type DuplicateElementOperation = z.infer<typeof DuplicateElementOperationSchema>;
