import { z } from "zod";
import type { FlexDiagnostic } from "./diagnostics.js";
import { DIRECTIONS, FLEX_DIRECTIONS, WRITING_MODES } from "./logical-axis.js";

const FlexRectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .readonly();

const GeometryEffectsSchema = z
  .object({
    transformAffected: z.boolean(),
    zoomAffected: z.boolean(),
  })
  .readonly();

export const FlexItemModelSchema = z
  .object({
    order: z.number(),
    inFlow: z.boolean(),
    display: z.enum(["box", "contents"]),
    rect: FlexRectSchema,
    marginMainStart: z.union([z.number(), z.literal("auto")]),
    marginMainEnd: z.union([z.number(), z.literal("auto")]),
    effects: GeometryEffectsSchema,
  })
  .readonly();

export const FlexContainerModelSchema = z
  .object({
    flexWrap: z.string(),
    mainSize: z.number().nullable(),
    rect: FlexRectSchema,
    effects: GeometryEffectsSchema,
    ancestorEffects: z.array(GeometryEffectsSchema).readonly(),
    hasNonWhitespaceDirectText: z.boolean(),
  })
  .readonly();

export const FlexPairEligibilityInputSchema = z
  .object({
    context: z
      .object({
        writingMode: z.enum(WRITING_MODES),
        direction: z.enum(DIRECTIONS),
        flexDirection: z.enum(FLEX_DIRECTIONS),
      })
      .readonly(),
    boundary: z.enum(["main-start", "main-end"]),
    primaryDomIndex: z.number(),
    visualNeighborAmbiguous: z.boolean(),
    container: FlexContainerModelSchema,
    items: z.array(FlexItemModelSchema).readonly(),
  })
  .readonly();

export type FlexItemModel = z.infer<typeof FlexItemModelSchema>;
export type FlexContainerModel = z.infer<typeof FlexContainerModelSchema>;
export type FlexPairEligibilityInput = z.infer<typeof FlexPairEligibilityInputSchema>;

export type ParseFlexPairEligibilityResult =
  | { readonly ok: true; readonly value: FlexPairEligibilityInput }
  | { readonly ok: false; readonly diagnostic: FlexDiagnostic };

export const parseFlexPairEligibilityInput = (input: unknown): ParseFlexPairEligibilityResult => {
  const parsed = FlexPairEligibilityInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    diagnostic: {
      code: "malformed_model",
      message: parsed.error.issues.map((issue) => issue.path.join(".")).join(", "),
    },
  };
};
