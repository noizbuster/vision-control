export {
  DRAG_THRESHOLD_PX,
  exceedsThreshold,
} from "./drag-threshold.js";
export type {
  InteractionEvent,
  InteractionEventType,
  PreviewKind,
  ResizeHandle,
} from "./events.js";
export {
  isPointerAcquireEvent,
  POINTER_ACQUIRE_EVENTS,
} from "./events.js";
export {
  buildGroupReorderOperation,
  buildGroupReparentOperation,
  createInitialGroupMoveState,
  type GroupMoveEffect,
  type GroupMoveEvent,
  type GroupMoveOperation,
  type GroupMoveReducerOptions,
  type GroupMoveState,
  type GroupMoveTransitionResult,
  transitionGroupMove,
} from "./group-move-transitions.js";
export {
  createInitialState,
  type Effect,
  INITIAL_CONTEXT,
  type InteractionMachineState,
  type MachineContext,
  type TransitionError,
  type TransitionLog,
  type TransitionOutcome,
  type TransitionResult,
  transition,
} from "./machine.js";
export {
  createInitialMultiSelectState,
  type MultiSelectEffect,
  type MultiSelectEvent,
  type MultiSelectReducerOptions,
  type MultiSelectState,
  type MultiSelectTransitionResult,
  transitionMultiSelect,
} from "./multi-select-transitions.js";
export {
  beginReorder,
  commitReorder,
  endReorder,
  type ReorderLayoutContext,
  type ReorderResult,
  type ReorderState,
  type ReorderTarget,
  updateReorder,
} from "./operations/reorder.js";
export type {
  CandidateContainer,
  DropEvaluation,
  DropTarget,
  DropValidity,
  FeasibilityReport,
  ReparentConfidence,
  ReparentElementDescriptor,
  ReparentPhase,
  ReparentResult,
  ReparentRisk,
  ReparentRiskKind,
  ReparentSession,
  SourcePatchFeasibility,
} from "./operations/reparent.js";
export {
  beginReparent,
  cancelReparent,
  endReparent,
  evaluateDropTarget,
} from "./operations/reparent.js";
export {
  createResizeOperation,
  type ResizeAxis,
  type ResizeModifiers,
  type ResizeOperation,
  type ResizePhase,
  type ResizePreview,
  type ResizeResult,
  type ResizeTarget,
} from "./operations/resize.js";
export {
  type AcquirePointerResult,
  acquirePointer,
  createPointerId,
  EmptyPointerIdError,
  isPointerBusy,
  NO_POINTER_OWNER,
  type PointerId,
  PointerIdSchema,
  type PointerOwner,
  type PointerOwnerKind,
  PointerOwnerKindSchema,
  PointerOwnerSchema,
  type PointerOwnershipState,
  PointerOwnershipStateSchema,
  releasePointer,
} from "./pointer-ownership.js";
export {
  INTERACTION_STATES,
  type InteractionStateValue,
  InteractionStateValueSchema,
  isInDraggingSubtree,
  isInSelectedSubtree,
  isPointerOwningState,
  isPreviewState,
  POINTER_OWNING_STATES,
  TOP_LEVEL_COMPOUNDS,
  type TopLevelCompound,
  topLevelOf,
} from "./states.js";

export const PACKAGE_NAME = "@vision-control/interaction-machine";
