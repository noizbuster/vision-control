import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * Add a class to the target element. Inverse: `class-remove` (same target and
 * className).
 */
export const ClassAddOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("class-add"),
  target: ElementRefSchema,
  className: z.string().min(1),
});

/**
 * Remove a class from the target element. Inverse: `class-add`.
 */
export const ClassRemoveOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("class-remove"),
  target: ElementRefSchema,
  className: z.string().min(1),
});

/**
 * Replace one class with another. Inverse: swap `oldClassName` and
 * `newClassName` (same kind).
 */
export const ClassReplaceOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("class-replace"),
  target: ElementRefSchema,
  oldClassName: z.string().min(1),
  newClassName: z.string().min(1),
});

export type ClassAddOperation = z.infer<typeof ClassAddOperationSchema>;
export type ClassRemoveOperation = z.infer<typeof ClassRemoveOperationSchema>;
export type ClassReplaceOperation = z.infer<typeof ClassReplaceOperationSchema>;
