import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * One or more element references the wrapper contained. min(1); carried so the
 * inverse (`wrap-elements`) is lossless and the pair stays symmetric.
 */
const UnwrapTargetsSchema = z.array(ElementRefSchema).min(1);

/**
 * Remove the `wrapper` element, promoting its `targets` up to `parent`. The
 * wrapper's `tagName` is carried so the inverse can reconstruct it.
 *
 * Inverse (`computeInverse`): `wrap-elements` that re-wraps the targets in a
 * fresh wrapper of the same tag under the same parent. Unwrap and Wrap are
 * mutual inverses; the symmetric field set keeps the double-inverse exact.
 */
export const UnwrapElementOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("unwrap-element"),
  /** Overridden to optional: unwrap carries `wrapper` + `targets`. */
  target: ElementRefSchema.optional(),
  wrapper: ElementRefSchema,
  parent: ElementRefSchema,
  tagName: z.string().min(1),
  targets: UnwrapTargetsSchema,
});

export type UnwrapElementOperation = z.infer<typeof UnwrapElementOperationSchema>;
