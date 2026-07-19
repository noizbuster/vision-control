export {
  appendOperation,
  type CanonicalChangeSet,
  CHANGE_IR_SCHEMA_VERSION,
  type ChangeSet,
  ChangeSetSchema,
  type CreateChangeSetOptions,
  computeInverse,
  createChangeSet,
  migrateChangeset_1_to_2,
  migrateChangeset_2_0_to_2_1,
  removeOperation,
  withPrivacyReport,
} from "./changeset.js";
export { conflictSignatures, FLEX_PAIR_CSS_PROPERTIES } from "./conflict-signatures.js";
export {
  type PageContext,
  PageContextSchema,
  type SourceResolution,
  SourceResolutionSchema,
  type VerificationAssertion,
  VerificationAssertionSchema,
  type VerificationPlan,
  VerificationPlanSchema,
  type ViewportContext,
  ViewportContextSchema,
} from "./context.js";
export { type ElementRef, ElementRefSchema } from "./element-ref.js";
export {
  type MergeConflict,
  type MergeResult,
  mergeChangeSets,
  mergeOperations,
  type SupersedeResult,
  supersedeChangeSet,
} from "./merge.js";
export {
  type BreakpointContext,
  BreakpointContextSchema,
  createOperationId,
  OPERATION_ID_PATTERN,
  type OperationBase,
  OperationBaseSchema,
  type OperationOrigin,
  OperationOriginSchema,
  type PseudoState,
  PseudoStateSchema,
} from "./operation-base.js";
export * from "./operations/index.js";
export {
  OPERATION_KINDS,
  type Operation,
  type OperationKind,
  OperationSchema,
} from "./operations/index.js";
export {
  type PrivacyRedaction,
  PrivacyRedactionSchema,
  type PrivacyRedactionSource,
  PrivacyRedactionSourceSchema,
  type PrivacyReport,
  PrivacyReportSchema,
} from "./privacy.js";
export {
  type DeserializeError,
  type DeserializeResult,
  deserializeChangeSet,
  serializeChangeSet,
} from "./serialization.js";
