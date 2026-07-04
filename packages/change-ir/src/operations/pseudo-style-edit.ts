import { z } from "zod";

import { OperationBaseSchema } from "../operation-base.js";

/**
 * The pseudo-element or pseudo-state this edit targets. Mirrors the
 * preview-engine `PseudoPreviewTarget` whitelist ( `pseudo-preview.ts` ): the
 * two readable pseudo-ELEMENTS ( `::before`, `::after` ) plus the four
 * pseudo-STATES the preview synthesizes a rule for. The kind is closed: an
 * arbitrary pseudo target is rejected at the schema boundary (PRD §7.3).
 */
export const PseudoStyleTargetSchema = z.enum([
  "::before",
  "::after",
  ":hover",
  ":focus",
  ":active",
  ":disabled",
]);
export type PseudoStyleTarget = z.infer<typeof PseudoStyleTargetSchema>;

/**
 * Edit a CSS declaration on a pseudo-element ( `::before` / `::after` ) or a
 * pseudo-state ( `:hover` / `:focus` / `:active` / `:disabled` ) of the target
 * element (PRD §7.3, VC-V1V2-20).
 *
 * Kept as a DISTINCT kind from `style-edit` so `style-edit` stays pure (host
 * inline style only) and pseudo edits route through their own preview path
 * ( `applyPseudoPreview` synthesizes a `[data-vc-preview-id="…"]::before` rule
 * via the stylesheet manager, never the inline style ). The pseudo routing
 * decision ( option a — a new kind ) is recorded in the v1-runtime plan task 1.
 *
 * `target` is the HOST element; the pseudo class is carried by `pseudoTarget`.
 * The edit is preview-only until an agent or human applies a real patch
 * (Appendix D.1).
 *
 * Inverse (`computeInverse`): swap `value` and `previousValue`, keeping
 * `pseudoTarget` / `property` / `important` fixed (the edit site does not
 * move). A lossless inverse requires `previousValue` to be captured from the
 * before-snapshot; the journal always supplies it.
 */
export const PseudoStyleEditOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("pseudo-style-edit"),
  /** Pseudo-element/state targeted on the host `target` element. */
  pseudoTarget: PseudoStyleTargetSchema,
  property: z.string().min(1),
  value: z.string(),
  important: z.boolean(),
  /** Prior pseudo-element/state value captured before the edit; required for a lossless inverse. */
  previousValue: z.string().optional(),
});

export type PseudoStyleEditOperation = z.infer<typeof PseudoStyleEditOperationSchema>;
