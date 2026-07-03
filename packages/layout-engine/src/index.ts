export * from "./alignment/index.js";
export * from "./auto-layout/index.js";
export {
  type ContentModelViolation,
  isValidChild,
  type ValidateReparentResult,
  validateReparent,
} from "./content-model.js";
export * from "./grid/index.js";
export {
  classifyGroupMove,
  type GroupFreeMoveIntent,
  type GroupMoveCandidate,
  type GroupMoveInput,
} from "./group-move-candidates.js";
export {
  type ChildBox,
  computeInsertionIndex,
  type InsertionIndicator,
  type InsertionResult,
} from "./insertion-index.js";
export {
  classifyLayoutRole,
  isFlexContainerRole,
  isGridRole,
  isNormalFlowRole,
  LAYOUT_ROLES,
  type LayoutComputedStyle,
  type LayoutRole,
  LayoutRoleSchema,
} from "./layout-role.js";
export {
  classifyAndGenerateResizeCandidates,
  type GridResizeContext,
  generateResizeCandidates,
  type ResizeCandidate,
  type ResizeCandidateKind,
  type ResizeCandidateSet,
  type ResizeCssPropertyCandidate,
  type ResizeDesignTokenCandidate,
  type ResizeGridSpanCandidate,
  type ResizeIntrinsicCandidate,
  type ResizePropertyKind,
  type ResizeTailwindClassCandidate,
  type ResizeUnsupportedDiagnostic,
} from "./resize-candidates.js";
export {
  classifySemanticIntent,
  type SemanticInput,
  type SemanticIntent,
} from "./semantic-operations.js";
export * from "./snap/index.js";

export const PACKAGE_NAME = "@vision-control/layout-engine";
