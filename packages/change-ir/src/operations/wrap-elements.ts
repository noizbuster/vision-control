import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * One or more element references to wrap. min(1) so a wrap always targets at
 * least one element.
 */
const WrapTargetsSchema = z.array(ElementRefSchema).min(1);

/**
 * Wrap `targets` in a new `wrapper` element inserted into `parent` with the
 * given `tagName`. The targets become children of the wrapper.
 *
 * Inverse (`computeInverse`): `unwrap-element` that removes the wrapper and
 * promotes the targets back to the parent. Wrap and Unwrap are mutual inverses;
 * the field sets are symmetric so the double-inverse restores the original.
 */
export const WrapElementsOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("wrap-elements"),
  /** Overridden to optional: wrap carries `targets` (plural) + `wrapper`. */
  target: ElementRefSchema.optional(),
  targets: WrapTargetsSchema,
  wrapper: ElementRefSchema,
  parent: ElementRefSchema,
  tagName: z.string().min(1),
});

export type WrapElementsOperation = z.infer<typeof WrapElementsOperationSchema>;
