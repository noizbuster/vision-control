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
import { DuplicateElementOperationSchema } from "./duplicate-element.js";
import { GridReorderOperationSchema, GridSpanOperationSchema } from "./grid.js";
import { InsertElementOperationSchema } from "./insert-element.js";
import {
  AlignElementsOperationSchema,
  DistributeElementsOperationSchema,
  GroupReorderOperationSchema,
  GroupReparentOperationSchema,
  MultiSelectGroupOperationSchema,
} from "./multi-select.js";
import { PositionElementOperationSchema } from "./position-element.js";
import { PseudoStyleEditOperationSchema } from "./pseudo-style-edit.js";
import { RemoveElementOperationSchema } from "./remove-element.js";
import { RemoveStyleOperationSchema } from "./remove-style.js";
import { ReorderChildOperationSchema } from "./reorder.js";
import { ReparentElementOperationSchema } from "./reparent.js";
import { ResizeElementOperationSchema } from "./resize.js";
import { ScreenshotCropRefOperationSchema } from "./screenshot.js";
import { SetAttributeOperationSchema } from "./set-attribute.js";
import { SetComponentPropOperationSchema } from "./set-component-prop.js";
import { StyleEditOperationSchema } from "./style.js";
import { SuggestedDiffOperationSchema } from "./suggested-diff.js";
import { TextEditOperationSchema } from "./text.js";
import { UnwrapElementOperationSchema } from "./unwrap-element.js";
import { WrapElementsOperationSchema } from "./wrap-elements.js";

export * from "./breakpoint.js";
export * from "./class.js";
export * from "./container-layout.js";
export * from "./duplicate-element.js";
export * from "./grid.js";
export * from "./insert-element.js";
export * from "./multi-select.js";
export * from "./position-element.js";
export * from "./pseudo-style-edit.js";
export * from "./remove-element.js";
export * from "./remove-style.js";
export * from "./reorder.js";
export * from "./reparent.js";
export * from "./resize.js";
export * from "./screenshot.js";
export * from "./set-attribute.js";
export * from "./set-component-prop.js";
export * from "./style.js";
export * from "./suggested-diff.js";
export * from "./text.js";
export * from "./unwrap-element.js";
export * from "./wrap-elements.js";

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
  RemoveStyleOperationSchema,
  ClassAddOperationSchema,
  ClassRemoveOperationSchema,
  ClassReplaceOperationSchema,
  SetAttributeOperationSchema,
  TextEditOperationSchema,
  ReorderChildOperationSchema,
  ReparentElementOperationSchema,
  PositionElementOperationSchema,
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
  InsertElementOperationSchema,
  RemoveElementOperationSchema,
  DuplicateElementOperationSchema,
  WrapElementsOperationSchema,
  UnwrapElementOperationSchema,
  BreakpointStyleEditOperationSchema,
  BreakpointClassEditOperationSchema,
  BreakpointTextEditOperationSchema,
  ScreenshotCropRefOperationSchema,
  SuggestedDiffOperationSchema,
  SetComponentPropOperationSchema,
  PseudoStyleEditOperationSchema,
]);

export type Operation = z.infer<typeof OperationSchema>;

/**
 * Discriminator literal values for every operation kind. Kept exhaustive: a
 * new kind must be appended here and to {@link OperationSchema}.
 */
export const OPERATION_KINDS = [
  "style-edit",
  "remove-style",
  "class-add",
  "class-remove",
  "class-replace",
  "set-attribute",
  "text-edit",
  "reorder-child",
  "reparent-element",
  "position-element",
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
  "insert-element",
  "remove-element",
  "duplicate-element",
  "wrap-elements",
  "unwrap-element",
  "breakpoint-style-edit",
  "breakpoint-class-edit",
  "breakpoint-text-edit",
  "screenshot-crop-ref",
  "suggested-diff",
  "set-component-prop",
  "pseudo-style-edit",
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];
