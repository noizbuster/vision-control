import type { ElementRef } from "@vision-control/element-identity";

import type { InteractionEvent, ResizeHandle } from "./events.js";
import {
  assertNeverState,
  deselect,
  endGesture,
  type InteractionMachineState,
  illegalTransition,
  noEffects,
  rejectPointerBusy,
  type TransitionResult,
  withContext,
} from "./machine-types.js";
import { acquirePointer, type PointerId } from "./pointer-ownership.js";
import { isPointerOwningState } from "./states.js";

// allow: SIZE_OK — a state machine's legal transition set is indivisible;
// splitting the per-state handlers across files would scatter one cohesive
// concern and break the reviewer's ability to see the whole transition graph.
export {
  createInitialState,
  type Effect,
  INITIAL_CONTEXT,
  type InteractionMachineState,
  type MachineContext,
  type TransitionError,
  type TransitionResult,
} from "./machine-types.js";

/**
 * The transition function: a pure reducer. `(state, event) -> { state, effects }`.
 * Illegal transitions return the UNCHANGED state plus a single `error` effect;
 * the caller decides whether to log it. The machine has no side effects.
 */
export const transition = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  // Pointer-ownership invariant: a drag/resize start while a pointer-owning
  // gesture is already active is rejected with an explicit `pointer-busy`
  // error (e.g. `drag-start` while `resizing`). This is the
  // one-owner-at-a-time guarantee (PRD section 10).
  if (event.type === "drag-start" && isPointerOwningState(state.value)) {
    return rejectPointerBusy(state, "drag");
  }
  if (event.type === "resize-start" && isPointerOwningState(state.value)) {
    return rejectPointerBusy(state, "resize");
  }

  switch (state.value) {
    case "idle":
      return fromIdle(state, event);
    case "inspecting":
      return fromInspecting(state, event);
    case "selecting":
      return fromSelecting(state, event);
    case "selected":
      return fromSelected(state, event);
    case "dragging":
      return fromDragging(state, event);
    case "resizing":
      return fromResizing(state, event);
    case "editing-text":
      return fromEditingText(state, event);
    case "previewing":
      return fromPreviewing(state, event);
    default:
      return assertNeverState(state.value);
  }
};

const fromIdle = (state: InteractionMachineState, event: InteractionEvent): TransitionResult => {
  switch (event.type) {
    case "pick-start":
      return { state: withContext(state, {}, "inspecting"), effects: [] };
    case "element-clicked":
      return {
        state: withContext(state, { pendingSelection: event.target }, "selecting"),
        effects: [{ kind: "show-outline", target: event.target }],
      };
    case "escape":
    case "deselect":
      return noEffects(state);
    default:
      return illegalTransition(state, event);
  }
};

const fromInspecting = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  switch (event.type) {
    case "pick-end":
      return { state: withContext(state, {}, "idle"), effects: [] };
    case "element-clicked":
      return {
        state: withContext(state, { pendingSelection: event.target }, "selecting"),
        effects: [{ kind: "show-outline", target: event.target }],
      };
    case "escape":
    case "deselect":
      return { state: withContext(state, {}, "idle"), effects: [] };
    default:
      return illegalTransition(state, event);
  }
};

const fromSelecting = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  const pending = state.context.pendingSelection;
  switch (event.type) {
    case "pick-end":
      // Commit the pending selection: inspector opens, outline stays.
      return pending === null
        ? illegalTransition(state, event)
        : {
            state: withContext(state, { selection: pending, pendingSelection: null }, "selected"),
            effects: [{ kind: "open-inspector", target: pending }],
          };
    case "element-clicked":
      return {
        state: withContext(state, { pendingSelection: event.target }, "selecting"),
        effects: [{ kind: "show-outline", target: event.target }],
      };
    case "escape":
    case "deselect":
      return {
        state: withContext(state, { pendingSelection: null }, "idle"),
        effects: [{ kind: "hide-outline" }],
      };
    default:
      return illegalTransition(state, event);
  }
};

const fromSelected = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  switch (event.type) {
    case "element-clicked":
      return {
        state: withContext(state, { selection: event.target, pendingSelection: null }, "selecting"),
        effects: [{ kind: "show-outline", target: event.target }, { kind: "close-inspector" }],
      };
    case "drag-start":
      return startDrag(state, event.pointerId, event.target);
    case "resize-start":
      return startResize(state, event.handle, event.pointerId);
    case "text-edit-start":
      return { state: withContext(state, {}, "editing-text"), effects: [] };
    case "escape":
    case "deselect":
      return deselect(state);
    default:
      return illegalTransition(state, event);
  }
};

const startDrag = (
  state: InteractionMachineState,
  pointerId: PointerId,
  target: ElementRef,
): TransitionResult => {
  const acquired = acquirePointer(state.context.activePointer, pointerId, "drag");
  if (!acquired.ok) {
    return rejectPointerBusy(state, "drag");
  }
  return {
    state: withContext(state, { activePointer: acquired.state, dragTarget: target }, "dragging"),
    effects: [{ kind: "begin-drag", target, pointerId }],
  };
};

const startResize = (
  state: InteractionMachineState,
  handle: ResizeHandle,
  pointerId: PointerId,
): TransitionResult => {
  const acquired = acquirePointer(state.context.activePointer, pointerId, "resize");
  if (!acquired.ok) {
    return rejectPointerBusy(state, "resize");
  }
  return {
    state: withContext(state, { activePointer: acquired.state, resizeHandle: handle }, "resizing"),
    effects: [{ kind: "begin-resize", handle, pointerId }],
  };
};

const fromDragging = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  switch (event.type) {
    case "drag-move":
      return { state, effects: [{ kind: "move-drag-preview", delta: event.delta }] };
    case "drag-end":
      return endGesture(state, "drag", [{ kind: "end-drag" }]);
    case "preview-start":
      return { state: withContext(state, {}, "previewing"), effects: [{ kind: "begin-preview" }] };
    case "escape":
      return endGesture(state, "drag", [{ kind: "rollback-preview" }, { kind: "end-drag" }]);
    default:
      return illegalTransition(state, event);
  }
};

const fromResizing = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  switch (event.type) {
    case "resize-end":
      return endGesture(state, "resize", [{ kind: "end-resize" }]);
    case "escape":
      return endGesture(state, "resize", [{ kind: "end-resize" }]);
    default:
      return illegalTransition(state, event);
  }
};

const fromEditingText = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  switch (event.type) {
    case "text-edit-end":
      return { state: withContext(state, {}, "selected"), effects: [] };
    case "escape":
      return { state: withContext(state, {}, "selected"), effects: [] };
    default:
      return illegalTransition(state, event);
  }
};

const fromPreviewing = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  switch (event.type) {
    case "preview-commit":
      return {
        state: withContext(state, { dragTarget: null }, "selected"),
        effects: [{ kind: "commit-preview" }],
      };
    case "preview-rollback":
      return {
        state: withContext(state, { dragTarget: null }, "selected"),
        effects: [{ kind: "rollback-preview" }],
      };
    case "drag-end":
      return endGesture(state, "drag", [{ kind: "commit-preview" }, { kind: "end-drag" }]);
    case "escape":
      return endGesture(state, "drag", [{ kind: "rollback-preview" }, { kind: "end-drag" }]);
    default:
      return illegalTransition(state, event);
  }
};
