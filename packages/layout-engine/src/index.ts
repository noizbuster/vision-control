export {
  type ContentModelViolation,
  isValidChild,
  type ValidateReparentResult,
  validateReparent,
} from "./content-model.js";
export {
  type ChildBox,
  computeInsertionIndex,
  type InsertionIndicator,
  type InsertionResult,
} from "./insertion-index.js";
export {
  classifyLayoutRole,
  isFlexContainerRole,
  isNormalFlowRole,
  LAYOUT_ROLES,
  type LayoutComputedStyle,
  type LayoutRole,
  LayoutRoleSchema,
} from "./layout-role.js";
export {
  classifyAndGenerateResizeCandidates,
  generateResizeCandidates,
  type ResizeCandidate,
  type ResizeCandidateSet,
  type ResizePropertyKind,
  type ResizeUnsupportedDiagnostic,
} from "./resize-candidates.js";
export {
  classifySemanticIntent,
  type SemanticInput,
  type SemanticIntent,
} from "./semantic-operations.js";

export const PACKAGE_NAME = "@vision-control/layout-engine";
