export { type ElementRef, ElementRefSchema } from "./element-ref.js";
export { computeFingerprint } from "./fingerprint.js";
export {
  createMultiSelectGroupId,
  isMultiSelectGroupId,
  type MultiSelectFrameKind,
  MultiSelectFrameKindSchema,
  type MultiSelectGroupId,
  MultiSelectGroupIdSchema,
  type MultiSelectMember,
  MultiSelectMemberSchema,
  type MultiSelectShadowKind,
  MultiSelectShadowKindSchema,
} from "./multi-select-identity.js";
export {
  ABSOLUTE_PATH_PATTERN,
  createRuntimeId,
  createSourceId,
  InvalidSourceIdError,
  isAbsolutePath,
  isDistinctRuntime,
  isSameSource,
  type RuntimeId,
  type SourceId,
} from "./runtime-source-separation.js";
export {
  type IdentityConfidence,
  IdentityConfidenceSchema,
  type SelectionIdentity,
  SelectionIdentitySchema,
  toSelectionIdentity,
} from "./selection-identity.js";
export {
  type AncestorDescriptor,
  type ElementDescriptor,
  type GenerateSelectorOptions,
  generateStableSelector,
} from "./selectors.js";
