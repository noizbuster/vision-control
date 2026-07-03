import { z } from "zod";
import {
  BreakpointClassEditOperationSchema,
  BreakpointStyleEditOperationSchema,
  BreakpointTextEditOperationSchema,
} from "./breakpoint.js";
import {
  ClassAddOperationSchema,
  ClassRemoveOperationSchema,
  ClassReplaceOperationSchema,
} from "./class.js";
import {
  SetChildSizingOperationSchema,
  SetContainerLayoutOperationSchema,
} from "./container-layout.js";
import { GridReorderOperationSchema, GridSpanOperationSchema } from "./grid.js";
import {
  AlignElementsOperationSchema,
  DistributeElementsOperationSchema,
  GroupReorderOperationSchema,
  GroupReparentOperationSchema,
  MultiSelectGroupOperationSchema,
} from "./multi-select.js";
import { ReorderChildOperationSchema } from "./reorder.js";
import { ReparentElementOperationSchema } from "./reparent.js";
import { ResizeElementOperationSchema } from "./resize.js";
import { ScreenshotCropRefOperationSchema } from "./screenshot.js";
import { StyleEditOperationSchema } from "./style.js";
import { SuggestedDiffOperationSchema } from "./suggested-diff.js";
import { TextEditOperationSchema } from "./text.js";

export * from "./breakpoint.js";
export * from "./class.js";
export * from "./container-layout.js";
export * from "./grid.js";
export * from "./multi-select.js";
export * from "./reorder.js";
export * from "./reparent.js";
export * from "./resize.js";
export * from "./screenshot.js";
export * from "./style.js";
export * from "./suggested-diff.js";
export * from "./text.js";

/**
 * Discriminated union of every operation, keyed by `kind`. To add a new kind:
 * define a schema with a unique `z.literal` under `operations/`, append it to
 * this array, and add an inverse branch to `computeInverse`. The exhaustive
 * switch in `computeInverse` makes a missing branch a compile error.
 *
 * v1.1.0 added the 14 V1 kinds (multi-select, group, layout, grid, breakpoint,
 * screenshot-ref, suggested-diff). See `src/SCHEMA_VERSION.md`.
 */
export const OperationSchema = z.discriminatedUnion("kind", [
  StyleEditOperationSchema,
  ClassAddOperationSchema,
  ClassRemoveOperationSchema,
  ClassReplaceOperationSchema,
  TextEditOperationSchema,
  ReorderChildOperationSchema,
  ReparentElementOperationSchema,
  ResizeElementOperationSchema,
  MultiSelectGroupOperationSchema,
  GroupReorderOperationSchema,
  GroupReparentOperationSchema,
  AlignElementsOperationSchema,
  DistributeElementsOperationSchema,
  SetContainerLayoutOperationSchema,
  SetChildSizingOperationSchema,
  GridReorderOperationSchema,
  GridSpanOperationSchema,
  BreakpointStyleEditOperationSchema,
  BreakpointClassEditOperationSchema,
  BreakpointTextEditOperationSchema,
  ScreenshotCropRefOperationSchema,
  SuggestedDiffOperationSchema,
]);

export type Operation = z.infer<typeof OperationSchema>;

/**
 * Discriminator literal values for every operation kind. Kept exhaustive: a
 * new kind must be appended here and to {@link OperationSchema}.
 */
export const OPERATION_KINDS = [
  "style-edit",
  "class-add",
  "class-remove",
  "class-replace",
  "text-edit",
  "reorder-child",
  "reparent-element",
  "resize-element",
  "multi-select-group",
  "group-reorder",
  "group-reparent",
  "align-elements",
  "distribute-elements",
  "set-container-layout",
  "set-child-sizing",
  "grid-reorder",
  "grid-span",
  "breakpoint-style-edit",
  "breakpoint-class-edit",
  "breakpoint-text-edit",
  "screenshot-crop-ref",
  "suggested-diff",
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];
