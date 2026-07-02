export {
  DRAG_THRESHOLD_PX,
  exceedsThreshold,
} from "./drag-threshold.js";
export type {
  InteractionEvent,
  InteractionEventType,
  ResizeHandle,
} from "./events.js";
export {
  createInitialState,
  type Effect,
  INITIAL_CONTEXT,
  type InteractionMachineState,
  type MachineContext,
  type TransitionError,
  type TransitionResult,
  transition,
} from "./machine.js";
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
  isPointerOwningState,
  POINTER_OWNING_STATES,
} from "./states.js";

export const PACKAGE_NAME = "@vision-control/interaction-machine";
