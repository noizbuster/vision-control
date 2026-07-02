import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * Replace the text content of the target element. Inverse: swap `newText` and
 * `previousText`. As with style edits, `previousText` must be captured from the
 * before-snapshot for a lossless inverse.
 */
export const TextEditOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("text-edit"),
  target: ElementRefSchema,
  newText: z.string(),
  /** Previous text captured before the edit; required for a lossless inverse. */
  previousText: z.string().optional(),
});

export type TextEditOperation = z.infer<typeof TextEditOperationSchema>;
