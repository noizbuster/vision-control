import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

const INDEX = z.number().int().nonnegative();

/**
 * Whether a grid reorder was resolved as a DOM-order change or a visual
 * grid-area/line/span placement. Accessibility-sensitive: DOM-order reorders
 * change reading order; grid-area placements keep DOM order and move only the
 * visual cell (PRD §15.5 / constraint: do not silently change DOM order).
 */
export const GridPlacementSchema = z.enum(["dom-order", "grid-area"]);

/**
 * Reorder a grid child. `placement` records the user's explicit choice between
 * DOM order and visual grid placement. Inverse swaps `fromIndex`/`toIndex` and
 * `previousGridArea`/`newGridArea`; `placement` is preserved (the inverse of a
 * dom-order reorder is a dom-order reorder).
 */
export const GridReorderOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("grid-reorder"),
  grid: ElementRefSchema,
  child: ElementRefSchema,
  placement: GridPlacementSchema,
  fromIndex: INDEX,
  toIndex: INDEX,
  previousGridArea: z.string().optional(),
  newGridArea: z.string().optional(),
});

/**
 * Resize the column or row span of a grid child. Inverse swaps `fromSpan` and
 * `toSpan`.
 */
export const GridSpanOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("grid-span"),
  grid: ElementRefSchema,
  child: ElementRefSchema,
  axis: z.enum(["column", "row"]),
  fromSpan: z.number().int().positive(),
  toSpan: z.number().int().positive(),
});

export type GridReorderOperation = z.infer<typeof GridReorderOperationSchema>;
export type GridSpanOperation = z.infer<typeof GridSpanOperationSchema>;
export type GridPlacement = z.infer<typeof GridPlacementSchema>;
