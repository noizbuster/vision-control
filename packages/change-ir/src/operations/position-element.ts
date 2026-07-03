import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * Explicitly change the CSS `position` scheme of the target element from
 * `fromValue` to `toValue` (e.g. `"static"` to `"relative"`).
 *
 * This is the EXPLICIT, user-intended positioning change — distinct from a
 * normal-flow drag, which MUST NOT collapse to absolute positioning (PRD
 * Appendix D constraint 2). The inverse swaps `fromValue` and `toValue`.
 *
 * `target` is inherited from {@link OperationBaseSchema} (PRD §12.4).
 */
export const PositionElementOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("position-element"),
  property: z.literal("position"),
  fromValue: z.string(),
  toValue: z.string(),
});

export type PositionElementOperation = z.infer<typeof PositionElementOperationSchema>;
