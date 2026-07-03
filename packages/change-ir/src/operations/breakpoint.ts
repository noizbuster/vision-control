import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * Style/class/text edits scoped to a responsive breakpoint.
 *
 * Breakpoint context fields (VC-V1V2-10, all additive + optional so legacy
 * ops without them still validate):
 * - `breakpoint` — the active breakpoint identifier (e.g. a Tailwind responsive
 *   prefix `md` or a named media query).
 * - `mediaSource` — the originating media query source text when known
 *   (e.g. `@media (min-width: 768px)`).
 * - `activeViewport` — the viewport label the user is currently editing under
 *   (e.g. `tablet`, `md`).
 * - `responsivePrefix` — the framework responsive prefix where applicable
 *   (e.g. the Tailwind `md` in `md:p-4`).
 * - `applyToBase` — EXPLICIT-INTENT flag. Absent or `false` means the edit is
 *   scoped to the breakpoint ONLY and must NOT touch base styles. Only `true`
 *   authorizes a base overwrite. See {@link isBaseOverwriteAllowed}.
 */

const breakpointContext = {
  breakpoint: z.string().min(1),
  mediaSource: z.string().optional(),
  activeViewport: z.string().min(1).optional(),
  responsivePrefix: z.string().min(1).optional(),
  applyToBase: z.boolean().optional(),
};

export const BreakpointStyleEditOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("breakpoint-style-edit"),
  target: ElementRefSchema,
  ...breakpointContext,
  property: z.string().min(1),
  value: z.string(),
  important: z.boolean(),
  previousValue: z.string().optional(),
});

export const BreakpointClassEditOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("breakpoint-class-edit"),
  target: ElementRefSchema,
  ...breakpointContext,
  oldClassName: z.string().min(1),
  newClassName: z.string().min(1),
});

export const BreakpointTextEditOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("breakpoint-text-edit"),
  target: ElementRefSchema,
  ...breakpointContext,
  newText: z.string(),
  previousText: z.string().optional(),
});

export type BreakpointStyleEditOperation = z.infer<typeof BreakpointStyleEditOperationSchema>;
export type BreakpointClassEditOperation = z.infer<typeof BreakpointClassEditOperationSchema>;
export type BreakpointTextEditOperation = z.infer<typeof BreakpointTextEditOperationSchema>;

export type BreakpointOperation =
  | BreakpointStyleEditOperation
  | BreakpointClassEditOperation
  | BreakpointTextEditOperation;

/**
 * Explicit-intent guard (VC-V1V2-10 / PRD constraint 2). Returns `true` ONLY
 * when a breakpoint edit carries `applyToBase: true`. Absent or `false` means
 * the edit is breakpoint-scoped and must not overwrite base styles. Downstream
 * consumers (preview engine, source intent) MUST consult this before touching
 * base-class/base-style declarations.
 */
export const isBaseOverwriteAllowed = (op: BreakpointOperation): boolean => op.applyToBase === true;
