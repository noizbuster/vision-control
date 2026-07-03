import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * Replace the text content of the target element. Inverse: swap `newText` and
 * `previousText`. As with style edits, `previousText` must be captured from the
 * before-snapshot for a lossless inverse.
 *
 * `target` is inherited from {@link OperationBaseSchema} (PRD §12.4).
 */
export const TextEditOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("text-edit"),
  newText: z.string(),
  /** Previous text captured before the edit; required for a lossless inverse. */
  previousText: z.string().optional(),
});

export type TextEditOperation = z.infer<typeof TextEditOperationSchema>;
