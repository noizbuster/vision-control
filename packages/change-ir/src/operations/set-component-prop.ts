import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * A `[startLine, startColumn, endLine, endColumn]`-shaped source range for the
 * JSX attribute the prop edit lands at. Defined inline (structurally identical
 * to storage's `SourceRange` and `suggested-diff`'s `SourceRangeSchema`) so
 * change-ir stays free of node-only package deps. The range is REQUIRED because
 * a component prop edit is only meaningful when it can be resolved to a precise
 * source location — unlike `set-attribute` (a DOM attribute), a component prop
 * has no DOM-side representation and must carry its source anchor (PRD §7.2).
 */
const SourceRangeSchema = z.object({
  startLine: z.number().int().nonnegative(),
  startColumn: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  endColumn: z.number().int().nonnegative(),
});

/**
 * Set a component-level prop (e.g. `variant`, `size`) on the target element by
 * editing the JSX attribute at `sourceRange` (PRD §7.2, R4 binding).
 *
 * Unlike `set-attribute` (which targets a DOM attribute and has no source
 * anchor), a `set-component-prop` carries the owning `componentName` and the
 * resolved `sourceRange` of the attribute value in the component instance. This
 * is what lets the operation be resolved to a deterministic source edit rather
 * than a guess. The prop is preview-only until an agent or human applies a real
 * patch (Appendix D.1).
 *
 * Inverse (`computeInverse`): a `set-component-prop` that swaps `value` and
 * `previousValue`, keeping `componentName`/`propName`/`sourceRange` fixed (the
 * edit site does not move). A lossless inverse requires `previousValue` to be
 * captured from the before-snapshot; the journal always supplies it.
 *
 * Cross-boundary edits (a prop whose source ownership lives in a different
 * component than the marker) are BLOCKED at the panel layer before an operation
 * is ever emitted, unless the caller opts in. The operation itself carries no
 * boundary flag — by the time a `set-component-prop` exists, the boundary check
 * has already passed.
 *
 * `target` is inherited from {@link OperationBaseSchema} (PRD §12.4).
 */
export const SetComponentPropOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("set-component-prop"),
  /** Owning component instance name (e.g. `"Button"`). */
  componentName: z.string().min(1),
  /** Prop name being edited (e.g. `"size"`, `"variant"`). */
  propName: z.string().min(1),
  value: z.string(),
  /** Prior prop value captured before the edit; required for a lossless inverse. */
  previousValue: z.string().optional(),
  /** Resolved source range of the JSX attribute value the edit lands at. */
  sourceRange: SourceRangeSchema,
});

export type SetComponentPropOperation = z.infer<typeof SetComponentPropOperationSchema>;
