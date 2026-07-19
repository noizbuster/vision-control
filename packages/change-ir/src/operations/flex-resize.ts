import { z } from "zod";
import { sameElementIdentity } from "../element-identity.js";
import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

export const FLEX_MEMBER_ROLES = ["primary", "neighbor"] as const;
export const FLEX_WRITING_MODES = ["horizontal-tb", "vertical-rl", "vertical-lr"] as const;
export const FLEX_DIRECTIONS = ["row", "row-reverse", "column", "column-reverse"] as const;

export const DurableElementRefSchema = ElementRefSchema.extend({
  selector: z.string().min(1),
  occurrence: z.number().int().nonnegative(),
  fingerprint: z.string().min(1),
}).strict();

export const FlexTripleSchema = z
  .object({
    flexGrow: z.string().min(1),
    flexShrink: z.string().min(1),
    flexBasis: z.string().min(1),
  })
  .strict();

export const FlexMemberStateSchema = z
  .object({
    flex: FlexTripleSchema,
    usedMainSize: z.number().nonnegative(),
  })
  .strict();

export const GeometryRectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();

const PrimaryMemberSchema = z
  .object({
    role: z.literal("primary"),
    element: DurableElementRefSchema,
    before: FlexMemberStateSchema,
    after: FlexMemberStateSchema,
  })
  .strict();

const NeighborMemberSchema = z
  .object({
    role: z.literal("neighbor"),
    element: DurableElementRefSchema,
    before: FlexMemberStateSchema,
    after: FlexMemberStateSchema,
  })
  .strict();

export const FlexRectWitnessSchema = z
  .object({
    element: DurableElementRefSchema,
    before: GeometryRectSchema,
    after: GeometryRectSchema,
  })
  .strict();

const RectTransitionSchema = z
  .object({ before: GeometryRectSchema, after: GeometryRectSchema })
  .strict();

const LOGICAL_AXIS_ORACLE = {
  "horizontal-tb": {
    ltr: { inline: { physicalAxis: "x", sign: 1 }, block: { physicalAxis: "y", sign: 1 } },
    rtl: { inline: { physicalAxis: "x", sign: -1 }, block: { physicalAxis: "y", sign: 1 } },
  },
  "vertical-rl": {
    ltr: { inline: { physicalAxis: "y", sign: 1 }, block: { physicalAxis: "x", sign: -1 } },
    rtl: { inline: { physicalAxis: "y", sign: -1 }, block: { physicalAxis: "x", sign: -1 } },
  },
  "vertical-lr": {
    ltr: { inline: { physicalAxis: "y", sign: 1 }, block: { physicalAxis: "x", sign: 1 } },
    rtl: { inline: { physicalAxis: "y", sign: -1 }, block: { physicalAxis: "x", sign: 1 } },
  },
} as const;

const FLEX_AXIS_RULES = {
  row: { logicalAxis: "inline", reverse: false },
  "row-reverse": { logicalAxis: "inline", reverse: true },
  column: { logicalAxis: "block", reverse: false },
  "column-reverse": { logicalAxis: "block", reverse: true },
} as const;

export const FlexAxisMetadataSchema = z
  .object({
    writingMode: z.enum(FLEX_WRITING_MODES),
    direction: z.enum(["ltr", "rtl"]),
    flexDirection: z.enum(FLEX_DIRECTIONS),
    logicalAxis: z.enum(["inline", "block"]),
    physicalAxis: z.enum(["x", "y"]),
    directionSign: z.union([z.literal(-1), z.literal(1)]),
    handleBoundary: z.enum(["main-start", "main-end"]),
  })
  .strict()
  .superRefine((axis, context) => {
    const rule = FLEX_AXIS_RULES[axis.flexDirection];
    const progression = LOGICAL_AXIS_ORACLE[axis.writingMode][axis.direction][rule.logicalAxis];
    const directionSign = rule.reverse ? (progression.sign === 1 ? -1 : 1) : progression.sign;
    if (axis.logicalAxis !== rule.logicalAxis) {
      context.addIssue({ code: "custom", message: "logical axis contradicts flex direction" });
    }
    if (axis.physicalAxis !== progression.physicalAxis) {
      context.addIssue({ code: "custom", message: "physical axis contradicts writing mode" });
    }
    if (axis.directionSign !== directionSign) {
      context.addIssue({ code: "custom", message: "direction sign contradicts axis progression" });
    }
  });

export const ResizeFlexPairOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("resize-flex-pair"),
  target: DurableElementRefSchema,
  container: DurableElementRefSchema,
  members: z.tuple([PrimaryMemberSchema, NeighborMemberSchema]),
  containerWitness: RectTransitionSchema,
  witnesses: z.array(FlexRectWitnessSchema),
  axis: FlexAxisMetadataSchema,
  delta: z.number(),
})
  .strict()
  .superRefine((operation, context) => {
    const [primary, neighbor] = operation.members;
    if (!sameElementIdentity(operation.target, primary.element)) {
      context.addIssue({ code: "custom", message: "target must identify the primary member" });
    }
    if (sameElementIdentity(primary.element, neighbor.element)) {
      context.addIssue({ code: "custom", message: "pair members must be distinct" });
    }
    if (
      sameElementIdentity(operation.container, primary.element) ||
      sameElementIdentity(operation.container, neighbor.element)
    ) {
      context.addIssue({ code: "custom", message: "container must be distinct from pair members" });
    }
    const occupied = [operation.container, primary.element, neighbor.element];
    for (const witness of operation.witnesses) {
      if (occupied.some((element) => sameElementIdentity(element, witness.element))) {
        context.addIssue({ code: "custom", message: "witness identities must be disjoint" });
      }
      occupied.push(witness.element);
    }
  });

export type DurableElementRef = z.infer<typeof DurableElementRefSchema>;
export type FlexAxisMetadata = z.infer<typeof FlexAxisMetadataSchema>;
export type FlexMemberState = z.infer<typeof FlexMemberStateSchema>;
export type FlexRectWitness = z.infer<typeof FlexRectWitnessSchema>;
export type FlexTriple = z.infer<typeof FlexTripleSchema>;
export type ResizeFlexPairOperation = z.infer<typeof ResizeFlexPairOperationSchema>;
