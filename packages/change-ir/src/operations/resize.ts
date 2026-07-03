import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * Resizable CSS properties covered by the resize gesture (PRD section 9.5).
 * Box-model dimensions, flex sizing fields, `aspect-ratio` (couples width and
 * height), and `align-self` (flex cross-axis `stretch`).
 */
export const RESIZE_PROPERTIES = [
  "width",
  "height",
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "aspect-ratio",
  "align-self",
] as const;

export const ResizePropertySchema = z.enum(RESIZE_PROPERTIES);

/**
 * Resize an element by changing one dimension property from `fromValue` to
 * `toValue` (with a CSS `unit`). Inverse: swap `fromValue` and `toValue`.
 */
export const ResizeElementOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("resize-element"),
  /** Overridden to optional: resize uses `element` as the authoritative ref. */
  target: ElementRefSchema.optional(),
  element: ElementRefSchema,
  property: ResizePropertySchema,
  fromValue: z.string(),
  toValue: z.string(),
  unit: z.string().min(1),
});

export type ResizeElementOperation = z.infer<typeof ResizeElementOperationSchema>;
export type ResizeProperty = z.infer<typeof ResizePropertySchema>;
