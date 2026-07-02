/**
 * Zod schemas and inferred types for the complete inspector selection summary.
 *
 * These schemas describe everything the DevTools panel displays and everything
 * that may be exported to the daemon or context compiler. All values are
 * JSON-safe except the live `Element` reference carried by breadcrumb items for
 * panel interaction; that reference is stripped by redaction before export.
 */

import {
  IdentityConfidenceSchema,
  SelectionIdentitySchema,
} from "@vision-control/element-identity";
import { PointSchema } from "@vision-control/geometry";
import { z } from "zod";

/** Layout mode of the selected element's parent. */
export const ParentLayoutModeSchema = z.enum(["flex", "grid", "block", "inline", "unknown"]);
export type ParentLayoutMode = z.infer<typeof ParentLayoutModeSchema>;

/** Margin / border / padding edge values in pixels. */
export const EdgeValuesSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});
export type EdgeValues = z.infer<typeof EdgeValuesSchema>;

/** CSS box model summary with numeric pixel values. */
export const BoxModelSummarySchema = z.object({
  margin: EdgeValuesSchema,
  border: EdgeValuesSchema,
  padding: EdgeValuesSchema,
  content: z.object({
    width: z.number(),
    height: z.number(),
  }),
  position: PointSchema,
});
export type BoxModelSummary = z.infer<typeof BoxModelSummarySchema>;

/** Subset of computed styles that are useful for the MVP panel. */
export const ComputedStyleSummarySchema = z.object({
  display: z.string(),
  position: z.string(),
  flexDirection: z.string(),
  alignItems: z.string(),
  justifyContent: z.string(),
  flexBasis: z.string(),
  flexGrow: z.string(),
  width: z.string(),
  height: z.string(),
  padding: z.string(),
  margin: z.string(),
  border: z.string(),
  color: z.string(),
  backgroundColor: z.string(),
  fontSize: z.string(),
  fontWeight: z.string(),
  lineHeight: z.string(),
});
export type ComputedStyleSummary = z.infer<typeof ComputedStyleSummarySchema>;

/** A single step in the DOM ancestry breadcrumb.
 *
 * The live `Element` reference is present when the summary is built inside the
 * content script; it is omitted when the summary crosses the message bus to the
 * panel, where only the selector is available for selection.
 */
export const BreadcrumbItemSchema = z.object({
  tagName: z.string(),
  id: z.string().optional(),
  className: z.string().optional(),
  role: z.string().optional(),
  selector: z.string().optional(),
  element: z.custom<Element>().optional(),
});
export type BreadcrumbItem = z.infer<typeof BreadcrumbItemSchema>;

/** Origin hint for a CSS class; placeholder until task 23. */
export const ClassSourceSchema = z.enum(["tailwind", "css", "unknown"]);
export type ClassSource = z.infer<typeof ClassSourceSchema>;

/** One parsed class on the selected element. */
export const ClassEntrySchema = z.object({
  name: z.string(),
  source: ClassSourceSchema,
});
export type ClassEntry = z.infer<typeof ClassEntrySchema>;

/** One safe attribute exposed in the inspector summary. */
export const AttributeEntrySchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type AttributeEntry = z.infer<typeof AttributeEntrySchema>;

/** Accessible semantic description of the selected element. */
export const SemanticSummarySchema = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  tagName: z.string(),
  textContentPreview: z.string(),
});
export type SemanticSummary = z.infer<typeof SemanticSummarySchema>;

/** Sibling context for layout reasoning. */
export const SiblingSummarySchema = z.object({
  count: z.number().int().min(0),
  index: z.number().int().min(0),
  parentTagName: z.string(),
  parentLayoutRole: z.string().optional(),
});
export type SiblingSummary = z.infer<typeof SiblingSummarySchema>;

/** Parent layout context for the selected element. */
export const ParentLayoutSummarySchema = z.object({
  mode: ParentLayoutModeSchema,
  display: z.string(),
  flexDirection: z.string().optional(),
});
export type ParentLayoutSummary = z.infer<typeof ParentLayoutSummarySchema>;

/** Confidence that the selection maps back to source. */
export const SourceConfidenceSchema = IdentityConfidenceSchema;
export type SourceConfidence = z.infer<typeof SourceConfidenceSchema>;

/** Complete redactable summary displayed in the panel and exported to agents. */
export const SelectionSummarySchema = z.object({
  identity: SelectionIdentitySchema,
  breadcrumb: z.array(BreadcrumbItemSchema),
  computedStyle: ComputedStyleSummarySchema,
  boxModel: BoxModelSummarySchema,
  classList: z.array(ClassEntrySchema),
  attributes: z.array(AttributeEntrySchema),
  semantic: SemanticSummarySchema,
  siblingSummary: SiblingSummarySchema,
  parentLayout: ParentLayoutSummarySchema,
  sourceConfidence: SourceConfidenceSchema,
});
export type SelectionSummary = z.infer<typeof SelectionSummarySchema>;
