import { z } from "zod";

import {
  ClassAddOperationSchema,
  ClassRemoveOperationSchema,
  ClassReplaceOperationSchema,
} from "./class.js";
import { ReorderChildOperationSchema } from "./reorder.js";
import { ReparentElementOperationSchema } from "./reparent.js";
import { ResizeElementOperationSchema } from "./resize.js";
import { StyleEditOperationSchema } from "./style.js";
import { TextEditOperationSchema } from "./text.js";

export * from "./class.js";
export * from "./reorder.js";
export * from "./reparent.js";
export * from "./resize.js";
export * from "./style.js";
export * from "./text.js";

/**
 * Discriminated union of every MVP operation, keyed by `kind`. To add a new
 * kind: define a schema with a unique `z.literal` under `operations/`, append
 * it to this array, and add an inverse branch to `computeInverse`. The
 * exhaustive switch in `computeInverse` makes a missing branch a compile error.
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
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];
