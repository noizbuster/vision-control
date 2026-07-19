import { canonicalizeParsedChangeSet } from "./changeset-migrations.js";
import {
  type CanonicalChangeSet,
  CHANGE_IR_SCHEMA_VERSION,
  type ChangeSet,
  CompatibleChangeSetSchema,
} from "./changeset-schema.js";
import type { PageContext, ViewportContext } from "./context.js";
import {
  DEFAULT_PAGE_CONTEXT,
  DEFAULT_VERIFICATION_PLAN,
  DEFAULT_VIEWPORT_CONTEXT,
} from "./context.js";
import { createOperationId } from "./operation-base.js";
import type { Operation } from "./operations/index.js";
import { DEFAULT_PRIVACY_REPORT, type PrivacyReport } from "./privacy.js";

export {
  migrateChangeset_1_to_2,
  migrateChangeset_2_0_to_2_1,
} from "./changeset-migrations.js";
export type { CanonicalChangeSet, ChangeSet } from "./changeset-schema.js";
export { CHANGE_IR_SCHEMA_VERSION } from "./changeset-schema.js";
export { computeInverse } from "./operation-inverse.js";

export const ChangeSetSchema = CompatibleChangeSetSchema.transform(canonicalizeParsedChangeSet);

export interface CreateChangeSetOptions {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly id?: string;
  readonly now?: number;
  readonly page?: PageContext;
  readonly viewport?: ViewportContext;
  readonly title?: string;
  readonly userInstruction?: string;
}

export const createChangeSet = (options: CreateChangeSetOptions): CanonicalChangeSet => {
  const now = options.now ?? Date.now();
  return {
    schemaVersion: CHANGE_IR_SCHEMA_VERSION,
    id: options.id ?? createOperationId(),
    workspaceId: options.workspaceId,
    sessionId: options.sessionId,
    page: options.page ?? DEFAULT_PAGE_CONTEXT,
    viewport: options.viewport ?? DEFAULT_VIEWPORT_CONTEXT,
    createdAt: now,
    updatedAt: now,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.userInstruction !== undefined ? { userInstruction: options.userInstruction } : {}),
    selectedTargets: [],
    operations: [],
    sourceResolutions: [],
    verificationPlan: DEFAULT_VERIFICATION_PLAN,
    privacyReport: DEFAULT_PRIVACY_REPORT,
    committed: false,
  };
};

export const appendOperation = (changeSet: ChangeSet, operation: Operation): ChangeSet => ({
  ...changeSet,
  operations: [...changeSet.operations, operation],
  updatedAt: Date.now(),
});

export const removeOperation = (changeSet: ChangeSet, operationId: string): ChangeSet => ({
  ...changeSet,
  operations: changeSet.operations.filter((operation) => operation.id !== operationId),
  updatedAt: Date.now(),
});

export const withPrivacyReport = (changeSet: ChangeSet, report: PrivacyReport): ChangeSet => ({
  ...changeSet,
  privacyReport: report,
  updatedAt: Date.now(),
});
