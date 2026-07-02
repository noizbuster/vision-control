export {
  appendOperation,
  type ChangeSet,
  ChangeSetSchema,
  type CreateChangeSetOptions,
  computeInverse,
  createChangeSet,
  removeOperation,
} from "./changeset.js";
export { type ElementRef, ElementRefSchema } from "./element-ref.js";
export {
  type MergeConflict,
  type MergeResult,
  mergeChangeSets,
  type SupersedeResult,
  supersedeChangeSet,
} from "./merge.js";
export {
  OPERATION_ID_PATTERN,
  type OperationBase,
  OperationBaseSchema,
} from "./operation-base.js";
export * from "./operations/index.js";
export {
  OPERATION_KINDS,
  type Operation,
  type OperationKind,
  OperationSchema,
} from "./operations/index.js";
export { type PrivacyReportPlaceholder, PrivacyReportPlaceholderSchema } from "./privacy.js";
export {
  type DeserializeError,
  type DeserializeResult,
  deserializeChangeSet,
  serializeChangeSet,
} from "./serialization.js";
