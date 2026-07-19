import { z } from "zod";
import {
  type CanonicalChangeSet,
  CanonicalChangeSetSchema,
  CHANGE_IR_SCHEMA_VERSION,
  type ChangeSet,
  LegacyChangeSet20Schema,
} from "./changeset-schema.js";
import {
  DEFAULT_PAGE_CONTEXT,
  DEFAULT_VERIFICATION_PLAN,
  DEFAULT_VIEWPORT_CONTEXT,
  SourceResolutionSchema,
} from "./context.js";
import { ElementRefSchema } from "./element-ref.js";
import { OperationSchema } from "./operations/index.js";

export const canonicalizeParsedChangeSet = (changeSet: ChangeSet): CanonicalChangeSet => {
  switch (changeSet.schemaVersion) {
    case CHANGE_IR_SCHEMA_VERSION:
      return changeSet;
    case "2.0.0":
      return CanonicalChangeSetSchema.parse({
        ...changeSet,
        schemaVersion: CHANGE_IR_SCHEMA_VERSION,
      });
    default: {
      const exhaustive: never = changeSet;
      throw new Error(`unsupported parsed change-ir version ${JSON.stringify(exhaustive)}`);
    }
  }
};

export const migrateChangeset_2_0_to_2_1 = (input: unknown): CanonicalChangeSet =>
  canonicalizeParsedChangeSet(LegacyChangeSet20Schema.parse(input));

const LEGACY_OPERATIONS = z
  .array(OperationSchema)
  .default([])
  .refine(
    (operations) => operations.every((operation) => operation.kind !== "resize-flex-pair"),
    "resize-flex-pair requires change-ir schema 2.1.0",
  );

const V1_CHANGESET_READER = z.looseObject({
  id: z.string(),
  sessionId: z.string(),
  operations: LEGACY_OPERATIONS,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  committed: z.boolean().default(false),
  supersededBy: z.string().optional(),
  workspaceId: z.string().optional(),
  title: z.string().optional(),
  userInstruction: z.string().optional(),
  selectedTargets: z.array(ElementRefSchema).default([]),
  sourceResolutions: z.array(SourceResolutionSchema).default([]),
});

export const migrateChangeset_1_to_2 = (input: unknown): CanonicalChangeSet => {
  const legacy = V1_CHANGESET_READER.parse(input);
  return CanonicalChangeSetSchema.parse({
    schemaVersion: CHANGE_IR_SCHEMA_VERSION,
    id: legacy.id,
    workspaceId: legacy.workspaceId ?? "<unknown>",
    sessionId: legacy.sessionId,
    page: DEFAULT_PAGE_CONTEXT,
    viewport: DEFAULT_VIEWPORT_CONTEXT,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    ...(legacy.title !== undefined ? { title: legacy.title } : {}),
    ...(legacy.userInstruction !== undefined ? { userInstruction: legacy.userInstruction } : {}),
    selectedTargets: legacy.selectedTargets,
    operations: legacy.operations,
    sourceResolutions: legacy.sourceResolutions,
    verificationPlan: {
      ...DEFAULT_VERIFICATION_PLAN,
      notes: "migrated from v1 — recompile via verification engine",
    },
    privacyReport: {
      redactions: [],
      totalRedacted: 0,
      note: "migrated v1 — recompute via redaction engine",
    },
    committed: legacy.committed,
    ...(legacy.supersededBy !== undefined ? { supersededBy: legacy.supersededBy } : {}),
  });
};
