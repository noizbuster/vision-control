import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * Set an inline style property on the target element.
 *
 * Inverse (`computeInverse`): swap `value` and `previousValue`. Invertibility
 * requires `previousValue` to be populated; the journal captures it from the
 * before-snapshot. A style edit created without `previousValue` is not
 * information-theoretically invertible — the inverse falls back to an empty
 * string value and real journal usage always supplies it.
 *
 * `target` is inherited from {@link OperationBaseSchema} (PRD §12.4).
 */
export const StyleEditOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("style-edit"),
  property: z.string().min(1),
  value: z.string(),
  important: z.boolean(),
  /** Previous value captured before the edit; required for a lossless inverse. */
  previousValue: z.string().optional(),
});

export type StyleEditOperation = z.infer<typeof StyleEditOperationSchema>;
