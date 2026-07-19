import {
  DurableElementRefSchema,
  FlexAxisMetadataSchema,
  FlexMemberStateSchema,
  FlexRectWitnessSchema,
  GeometryRectSchema,
  type OperationKind,
  ResizeFlexPairOperationSchema,
} from "@vision-control/change-ir";
import { z } from "zod";

export const OPERATION_SUMMARY_KINDS = [
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
  "resize-flex-pair",
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
] as const satisfies readonly OperationKind[];

const LEGACY_OPERATION_SUMMARY_KINDS = [
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
] as const satisfies readonly Exclude<OperationKind, "resize-flex-pair">[];

export const OperationSummaryKindSchema = z.enum(OPERATION_SUMMARY_KINDS);
export type OperationSummaryKind = z.infer<typeof OperationSummaryKindSchema>;

const OperationSummaryBaseFields = {
  id: z.string(),
  runtime: z.boolean(),
  description: z.string(),
  target: z.string().optional(),
};

const PrimaryMemberSummarySchema = z
  .object({
    role: z.literal("primary"),
    element: DurableElementRefSchema,
    before: FlexMemberStateSchema,
    after: FlexMemberStateSchema,
  })
  .strict();

const NeighborMemberSummarySchema = z
  .object({
    role: z.literal("neighbor"),
    element: DurableElementRefSchema,
    before: FlexMemberStateSchema,
    after: FlexMemberStateSchema,
  })
  .strict();

const RectTransitionSummarySchema = z
  .object({ before: GeometryRectSchema, after: GeometryRectSchema })
  .strict();

export const ResizeFlexPairSummaryDetailSchema = z
  .object({
    target: DurableElementRefSchema,
    container: DurableElementRefSchema,
    members: z.tuple([PrimaryMemberSummarySchema, NeighborMemberSummarySchema]),
    containerWitness: RectTransitionSummarySchema,
    witnesses: z.array(FlexRectWitnessSchema),
    axis: FlexAxisMetadataSchema,
    delta: z.number(),
    witnessCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((detail, context) => {
    if (detail.witnessCount !== detail.witnesses.length) {
      context.addIssue({ code: "custom", message: "witnessCount must match witnesses length" });
    }
    const operation = ResizeFlexPairOperationSchema.safeParse({
      id: "op-summary-validation",
      timestamp: 0,
      runtime: false,
      origin: "canvas-drag",
      confidence: 1,
      kind: "resize-flex-pair",
      target: detail.target,
      container: detail.container,
      members: detail.members,
      containerWitness: detail.containerWitness,
      witnesses: detail.witnesses,
      axis: detail.axis,
      delta: detail.delta,
    });
    if (!operation.success) {
      for (const issue of operation.error.issues) {
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
    }
  });
export type ResizeFlexPairSummaryDetail = z.infer<typeof ResizeFlexPairSummaryDetailSchema>;

export const ResizeFlexPairOperationSummarySchema = z.object({
  ...OperationSummaryBaseFields,
  kind: z.literal("resize-flex-pair"),
  detail: ResizeFlexPairSummaryDetailSchema,
});
export type ResizeFlexPairOperationSummary = z.infer<typeof ResizeFlexPairOperationSummarySchema>;

export const LegacyOperationSummarySchema = z.object({
  ...OperationSummaryBaseFields,
  kind: z.enum(LEGACY_OPERATION_SUMMARY_KINDS),
  detail: z.record(z.string(), z.string()),
});
export type LegacyOperationSummary = z.infer<typeof LegacyOperationSummarySchema>;

export const OperationSummarySchema = z.union([
  ResizeFlexPairOperationSummarySchema,
  LegacyOperationSummarySchema,
]);
export type OperationSummary = z.infer<typeof OperationSummarySchema>;
