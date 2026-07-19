import { z } from "zod";

import { SourceConfidenceLevelSchema, TargetIdentitySchema } from "./target-context-schema.js";

export const MultiSelectSummarySchema = z.object({
  groupId: z.string(),
  targets: z.array(TargetIdentitySchema),
});
export type MultiSelectSummary = z.infer<typeof MultiSelectSummarySchema>;

export const BreakpointContextSchema = z.object({
  activeViewport: z.string(),
  mediaQuerySource: z.string().optional(),
  responsivePrefix: z.string().optional(),
  scopedChangeCount: z.number().int().nonnegative().optional(),
});
export type BreakpointContext = z.infer<typeof BreakpointContextSchema>;

export const SourceConfidenceDetailSchema = z.object({
  method: z.string(),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SourceConfidenceDetail = z.infer<typeof SourceConfidenceDetailSchema>;

export const ScreenshotRedactionSummarySchema = z.object({
  totalMasked: z.number().int().nonnegative(),
  postCaptureRecheck: z.enum(["pass", "fail"]),
});
export type ScreenshotRedactionSummary = z.infer<typeof ScreenshotRedactionSummarySchema>;

export const ScreenshotRefSummarySchema = z.object({
  artifactId: z.string(),
  redactionReport: z.string().optional(),
  redactionSummary: ScreenshotRedactionSummarySchema.optional(),
});
export type ScreenshotRefSummary = z.infer<typeof ScreenshotRefSummarySchema>;

export const SuggestedDiffSummarySchema = z.object({
  diff: z.string(),
  confidence: SourceConfidenceLevelSchema,
  preconditions: z.array(z.string()),
  kind: z
    .enum([
      "tailwind-token-replace",
      "css-declaration-replace",
      "css-class-replace",
      "css-modules-local-edit",
      "inline-style-object-edit",
      "jsx-text-edit",
      "simple-reorder",
    ])
    .optional(),
  sourceRanges: z
    .array(
      z.object({
        startLine: z.number().int().positive(),
        startColumn: z.number().int().nonnegative(),
        endLine: z.number().int().positive(),
        endColumn: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});
export type SuggestedDiffSummary = z.infer<typeof SuggestedDiffSummarySchema>;

export const TokenRegistrySummarySchema = z.object({
  totalTokens: z.number().int().nonnegative(),
  categories: z.record(z.string(), z.number().int().nonnegative()),
  sources: z.array(z.string()),
  conflictCount: z.number().int().nonnegative(),
});
export type TokenRegistrySummary = z.infer<typeof TokenRegistrySummarySchema>;

export const ComponentPropSummarySchema = z.object({
  name: z.string(),
  kind: z.string(),
  editable: z.boolean(),
  value: z.string().optional(),
  candidates: z.array(z.string()).optional(),
});
export type ComponentPropSummary = z.infer<typeof ComponentPropSummarySchema>;

export const ComponentPropsSummarySchema = z.object({
  componentName: z.string(),
  framework: z.string(),
  props: z.array(ComponentPropSummarySchema),
  ownershipRisk: z.enum(["none", "low", "medium", "high"]),
  warnings: z.array(z.string()),
});
export type ComponentPropsSummary = z.infer<typeof ComponentPropsSummarySchema>;
