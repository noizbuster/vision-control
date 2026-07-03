import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * Remove an inline style property from the target element.
 *
 * Inverse (`computeInverse`): a `style-edit` that restores the removed value.
 * Invertibility requires `previousValue` to be populated from the
 * before-snapshot; a remove-style created without it falls back to an empty
 * restore (matching the style-edit convention).
 *
 * `target` is inherited from {@link OperationBaseSchema} (PRD §12.4).
 */
export const RemoveStyleOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("remove-style"),
  property: z.string().min(1),
  /** Value captured before the removal; required for a lossless inverse. */
  previousValue: z.string().optional(),
  /** Whether the removed declaration carried `!important`. */
  important: z.boolean().optional(),
});

export type RemoveStyleOperation = z.infer<typeof RemoveStyleOperationSchema>;
