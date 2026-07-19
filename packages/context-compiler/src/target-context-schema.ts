import { z } from "zod";

export const SourceConfidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type SourceConfidenceLevel = z.infer<typeof SourceConfidenceLevelSchema>;

export const TargetIdentitySchema = z.object({
  runtimeId: z.string().optional(),
  sourceId: z.string().optional(),
  fingerprint: z.string().optional(),
  confidence: SourceConfidenceLevelSchema.optional(),
  selectors: z.array(z.string()),
});
export type TargetIdentity = z.infer<typeof TargetIdentitySchema>;

export const BreadcrumbSummarySchema = z.object({
  tagName: z.string(),
  id: z.string().optional(),
  className: z.string().optional(),
  role: z.string().optional(),
  selector: z.string().optional(),
});
export type BreadcrumbSummary = z.infer<typeof BreadcrumbSummarySchema>;

export const SemanticSummarySchema = z.object({
  tagName: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  textContentPreview: z.string(),
});
export type SemanticSummary = z.infer<typeof SemanticSummarySchema>;

export const ClassEntrySchema = z.object({
  name: z.string(),
  source: z.string(),
});
export type ClassEntry = z.infer<typeof ClassEntrySchema>;

export const AttributeEntrySchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type AttributeEntry = z.infer<typeof AttributeEntrySchema>;

export const BoxModelSummarySchema = z.object({
  contentWidth: z.number(),
  contentHeight: z.number(),
  positionX: z.number(),
  positionY: z.number(),
});
export type BoxModelSummary = z.infer<typeof BoxModelSummarySchema>;

export const TargetSummarySchema = z.object({
  identity: TargetIdentitySchema,
  semantic: SemanticSummarySchema,
  breadcrumb: z.array(BreadcrumbSummarySchema),
  computedStyle: z.record(z.string(), z.string()),
  boxModel: BoxModelSummarySchema,
  classList: z.array(ClassEntrySchema),
  attributes: z.array(AttributeEntrySchema),
});
export type TargetSummary = z.infer<typeof TargetSummarySchema>;

export const LayoutSummarySchema = z.object({
  parentMode: z.string(),
  parentDisplay: z.string(),
  parentFlexDirection: z.string().optional(),
  siblingCount: z.number().int().min(0),
  siblingIndex: z.number().int().min(0),
});
export type LayoutSummary = z.infer<typeof LayoutSummarySchema>;

export const LayoutContextSummarySchema = z.object({
  gridColumns: z.number().int().nonnegative().optional(),
  gridRows: z.number().int().nonnegative().optional(),
  autoLayout: z.string().optional(),
});
export type LayoutContextSummary = z.infer<typeof LayoutContextSummarySchema>;
