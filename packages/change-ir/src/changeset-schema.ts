import { z } from "zod";

import {
  PageContextSchema,
  SourceResolutionSchema,
  VerificationPlanSchema,
  ViewportContextSchema,
} from "./context.js";
import { ElementRefSchema } from "./element-ref.js";
import { OPERATION_ID_PATTERN } from "./operation-base.js";
import { OperationSchema } from "./operations/index.js";
import { PrivacyReportSchema } from "./privacy.js";

export const CHANGE_IR_SCHEMA_VERSION = "2.1.0" as const;
export const LEGACY_CHANGE_IR_SCHEMA_VERSION = "2.0.0" as const;

const ID = z.string().regex(OPERATION_ID_PATTERN);
const CHANGESET_FIELDS = {
  id: ID,
  workspaceId: z.string().min(1),
  sessionId: ID,
  page: PageContextSchema,
  viewport: ViewportContextSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  title: z.string().optional(),
  userInstruction: z.string().optional(),
  selectedTargets: z.array(ElementRefSchema),
  sourceResolutions: z.array(SourceResolutionSchema),
  verificationPlan: VerificationPlanSchema,
  privacyReport: PrivacyReportSchema,
  committed: z.boolean(),
  supersededBy: ID.optional(),
} as const;

export const CanonicalChangeSetSchema = z.object({
  schemaVersion: z.literal(CHANGE_IR_SCHEMA_VERSION),
  ...CHANGESET_FIELDS,
  operations: z.array(OperationSchema),
});

export const LegacyChangeSet20Schema = z.object({
  schemaVersion: z.literal(LEGACY_CHANGE_IR_SCHEMA_VERSION),
  ...CHANGESET_FIELDS,
  operations: z
    .array(OperationSchema)
    .refine(
      (operations) => operations.every((operation) => operation.kind !== "resize-flex-pair"),
      "resize-flex-pair requires change-ir schema 2.1.0",
    ),
});

export const CompatibleChangeSetSchema = z.union([
  CanonicalChangeSetSchema,
  LegacyChangeSet20Schema,
]);

export type CanonicalChangeSet = z.infer<typeof CanonicalChangeSetSchema>;
export type LegacyChangeSet20 = Omit<CanonicalChangeSet, "schemaVersion"> & {
  readonly schemaVersion: typeof LEGACY_CHANGE_IR_SCHEMA_VERSION;
};
export type ChangeSet = CanonicalChangeSet | LegacyChangeSet20;
