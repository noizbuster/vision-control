import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * One or more element references forming a selection group. min(1) so a group
 * always carries at least one target; group-reorder/group-reparent/align/
 * distribute require min(2) because a single element has nothing to move
 * relative to.
 */
export const ElementGroupSchema = z.array(ElementRefSchema).min(1);

const INDEX = z.number().int().nonnegative();

/**
 * Record a multi-selection as a named group. Establishes the group identity
 * that group-reorder / group-reparent / align / distribute operations anchor on.
 *
 * Inverse (`computeInverse`): swap `targets` and `previousTargets`. The journal
 * captures `previousTargets` from the prior selection; a group created without
 * it falls back to an empty array (the inverse clears the group).
 */
export const MultiSelectGroupOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("multi-select-group"),
  /** Overridden to optional: group ops carry `targets` (plural). */
  target: ElementRefSchema.optional(),
  targets: ElementGroupSchema,
  groupId: z.string().min(1),
  /** Prior group composition captured before the change; required for a lossless inverse. */
  previousTargets: ElementGroupSchema.optional(),
});

/**
 * Reorder a group of siblings within the same parent. `previousOrder`/`newOrder`
 * are parallel index arrays: `newOrder[i]` is the original index of the element
 * that now sits at position `i`. The inverse swaps the two orderings.
 */
export const GroupReorderOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("group-reorder"),
  /** Overridden to optional: group ops carry `children` (plural). */
  target: ElementRefSchema.optional(),
  parent: ElementRefSchema,
  children: ElementGroupSchema.min(2),
  previousOrder: z.array(INDEX),
  newOrder: z.array(INDEX),
});

/**
 * Reparent a group of elements from one parent to another. `sourceIndices` and
 * `targetIndices` are parallel to `elements`. The inverse swaps the
 * `(sourceParent, sourceIndices)` and `(targetParent, targetIndices)` pairs.
 */
export const GroupReparentOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("group-reparent"),
  /** Overridden to optional: group ops carry `elements` (plural). */
  target: ElementRefSchema.optional(),
  elements: ElementGroupSchema,
  sourceParent: ElementRefSchema,
  sourceIndices: z.array(INDEX),
  targetParent: ElementRefSchema,
  targetIndices: z.array(INDEX),
});

/**
 * Align a group of elements along an axis. `previousValues`/`newValues` are
 * parallel to `targets` and carry the per-element alignment value (e.g. the
 * computed `left`/`top`/`transform`). The inverse swaps the two value arrays.
 */
export const AlignElementsOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("align-elements"),
  /** Overridden to optional: group ops carry `targets` (plural). */
  target: ElementRefSchema.optional(),
  targets: ElementGroupSchema.min(2),
  alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
  previousValues: z.array(z.string()),
  newValues: z.array(z.string()),
});

/**
 * Distribute a group of elements along an axis with a spacing mode.
 * `previousGaps`/`newGaps` are the per-gap spacing values (parallel to the gaps
 * between `targets`). The inverse swaps the two gap arrays.
 */
export const DistributeElementsOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("distribute-elements"),
  /** Overridden to optional: group ops carry `targets` (plural). */
  target: ElementRefSchema.optional(),
  targets: ElementGroupSchema.min(2),
  axis: z.enum(["horizontal", "vertical"]),
  mode: z.enum(["space-between", "space-around", "equal-gap"]),
  previousGaps: z.array(z.string()),
  newGaps: z.array(z.string()),
});

export type MultiSelectGroupOperation = z.infer<typeof MultiSelectGroupOperationSchema>;
export type GroupReorderOperation = z.infer<typeof GroupReorderOperationSchema>;
export type GroupReparentOperation = z.infer<typeof GroupReparentOperationSchema>;
export type AlignElementsOperation = z.infer<typeof AlignElementsOperationSchema>;
export type DistributeElementsOperation = z.infer<typeof DistributeElementsOperationSchema>;
