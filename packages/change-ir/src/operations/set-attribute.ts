import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * Set an HTML attribute on the target element to `value`.
 *
 * Inverse (`computeInverse`): a `set-attribute` that restores `previousValue`
 * (swapping `value` and `previousValue`). When the attribute did not exist
 * before (`previousValue` absent), the inverse restores an empty string — the
 * closest representable state given there is no standalone `remove-attribute`
 * kind in the PRD §12.3 union. A lossless inverse therefore requires
 * `previousValue` to be captured from the before-snapshot.
 *
 * `target` is inherited from {@link OperationBaseSchema} (PRD §12.4).
 */
export const SetAttributeOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("set-attribute"),
  name: z.string().min(1),
  value: z.string(),
  /** Prior attribute value captured before the set; required for a lossless inverse. */
  previousValue: z.string().optional(),
});

export type SetAttributeOperation = z.infer<typeof SetAttributeOperationSchema>;
