import { type ElementRef, ElementRefSchema } from "@vision-control/element-identity";
import { z } from "zod";

/**
 * Snap System candidate types (PRD section 9.8).
 *
 * A snap candidate is an ADVISORY proposal: the engine emits candidates that
 * describe where the pointer COULD snap; a caller applies one only when its
 * `distance` is under the caller's threshold. The engine never forces a snap.
 * This module is pure and DOM-free; the layout-engine package is
 * `platform:isomorphic`.
 */

/**
 * Kind of snap line (PRD §9.8:722).
 *
 * - `edge` — aligns to an element's leading or trailing box edge.
 * - `center` — aligns to an element's center on an axis.
 * - `baseline` — aligns to an inline baseline (y-axis only).
 * - `grid` — aligns to a grid line (explicit or from the configurable grid).
 * - `spacing-token` — aligns so the gap to a sibling equals a design token.
 */
export const SNAP_KINDS = ["edge", "center", "baseline", "grid", "spacing-token"] as const;

export type SnapKind = (typeof SNAP_KINDS)[number];

export const SnapKindSchema = z.enum(SNAP_KINDS);

/**
 * Axis a snap line runs along. A candidate with `axis: "x"` describes a
 * vertical snap line at `value` (a horizontal pointer motion snaps to it); a
 * candidate with `axis: "y"` describes a horizontal snap line.
 */
export const SNAP_AXES = ["x", "y"] as const;

export type SnapAxis = (typeof SNAP_AXES)[number];

export const SnapAxisSchema = z.enum(SNAP_AXES);

/**
 * A single advisory snap candidate (PRD §9.8:720-728).
 *
 * - `kind` — which snap source produced this candidate.
 * - `axis` — the axis the snap line lives on (`"x"` = vertical line).
 * - `value` — the snap line coordinate, in the caller's coordinate space.
 * - `source` — the element the snap is relative to, when applicable (parent,
 *   sibling, baseline owner). Absent for grid/configurable-grid candidates.
 * - `token` — the design-token name, set only for `spacing-token` candidates.
 * - `distance` — absolute distance from the pointer to `value` on `axis`. The
 *   engine sorts candidates by this value ascending; the caller applies a snap
 *   only when `distance` is below its threshold.
 */
export interface SnapCandidate {
  readonly kind: SnapKind;
  readonly axis: SnapAxis;
  readonly value: number;
  readonly source?: ElementRef;
  readonly token?: string;
  readonly distance: number;
}

export const SnapCandidateSchema = z.object({
  kind: SnapKindSchema,
  axis: SnapAxisSchema,
  value: z.number(),
  source: ElementRefSchema.optional(),
  token: z.string().min(1).optional(),
  distance: z.number().min(0),
});
