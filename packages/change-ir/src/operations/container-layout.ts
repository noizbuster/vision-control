import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

const INDEX = z.number().int().nonnegative();

/**
 * Hug / Fill / Fixed sizing intent for a container child (PRD Auto Layout).
 * The enum is the canonical sizing vocabulary; the concrete CSS property lives
 * in `value` (e.g. `"flex: 1"` for Fill, `"width: 120px"` for Fixed).
 */
export const ChildSizingSchema = z.enum(["hug", "fill", "fixed"]);

/**
 * Change one layout property on a container (direction, gap, padding, wrap,
 * main/cross alignment). Mirrors style-edit semantics on a parent element.
 *
 * Inverse (`computeInverse`): swap `value` and `previousValue`.
 */
export const SetContainerLayoutOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("set-container-layout"),
  container: ElementRefSchema,
  property: z.string().min(1),
  value: z.string(),
  /** Prior value captured before the edit; required for a lossless inverse. */
  previousValue: z.string().optional(),
});

/**
 * Set the sizing behavior of a single child within a container, identified by
 * its index/role plus an element ref. Inverse swaps `sizing`/`previousSizing`
 * and `value`/`previousValue`.
 */
export const SetChildSizingOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("set-child-sizing"),
  container: ElementRefSchema,
  childIndex: INDEX,
  child: ElementRefSchema,
  sizing: ChildSizingSchema,
  previousSizing: ChildSizingSchema.optional(),
  value: z.string().optional(),
  previousValue: z.string().optional(),
});

export type SetContainerLayoutOperation = z.infer<typeof SetContainerLayoutOperationSchema>;
export type SetChildSizingOperation = z.infer<typeof SetChildSizingOperationSchema>;
export type ChildSizing = z.infer<typeof ChildSizingSchema>;
