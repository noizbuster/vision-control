import type { ElementRef } from "@vision-control/element-identity";
import type { Point } from "@vision-control/geometry";

import type { InteractionEvent, InteractionEventType, ResizeHandle } from "./events.js";
import {
  NO_POINTER_OWNER,
  type PointerId,
  type PointerOwner,
  type PointerOwnerKind,
  type PointerOwnershipState,
  releasePointer,
} from "./pointer-ownership.js";
import type { InteractionStateValue } from "./states.js";

/**
 * Carry-along context for the state machine. Immutable: every transition
 * returns a fresh state object. The {@link InteractionMachineState.value} is the
 * SINGLE state discriminator — never a flag soup (`isDragging` + `isResizing`
 * + ...). The pointer-ownership snapshot lives here, not as a sibling flag.
 */
export interface MachineContext {
  /** The committed selection (inspector target). Null until `selected`. */
  readonly selection: ElementRef | null;
  /** The pending target while `inspecting`/`selecting`, before commit. */
  readonly pendingSelection: ElementRef | null;
  /** Pointer ownership snapshot — enforces the one-owner invariant. */
  readonly activePointer: PointerOwnershipState;
  /** Element being dragged. Set on `drag-start`, cleared on `drag-end`. */
  readonly dragTarget: ElementRef | null;
  /** Active resize handle. Set on `resize-start`, cleared on `resize-end`. */
  readonly resizeHandle: ResizeHandle | null;
}

export interface InteractionMachineState {
  readonly value: InteractionStateValue;
  readonly context: MachineContext;
}

/**
 * Side-effect description emitted by a transition. The machine NEVER touches the
 * DOM; browser packages interpret these and perform the actual mutation
 * (show/hide outline, begin/end drag, open/close inspector, preview lifecycle).
 */
export type Effect =
  | { readonly kind: "show-outline"; readonly target: ElementRef }
  | { readonly kind: "hide-outline" }
  | { readonly kind: "begin-drag"; readonly target: ElementRef; readonly pointerId: PointerId }
  | { readonly kind: "end-drag" }
  | { readonly kind: "move-drag-preview"; readonly delta: Point }
  | { readonly kind: "begin-resize"; readonly handle: ResizeHandle; readonly pointerId: PointerId }
  | { readonly kind: "end-resize" }
  | { readonly kind: "open-inspector"; readonly target: ElementRef }
  | { readonly kind: "close-inspector" }
  | { readonly kind: "begin-preview" }
  | { readonly kind: "commit-preview" }
  | { readonly kind: "rollback-preview" }
  | { readonly kind: "error"; readonly error: TransitionError };

export type TransitionError =
  | {
      readonly code: "illegal-transition";
      readonly from: InteractionStateValue;
      readonly event: InteractionEventType;
    }
  | {
      readonly code: "pointer-busy";
      readonly current: PointerOwner;
      readonly attempted: PointerOwnerKind;
    };

export interface TransitionResult {
  readonly state: InteractionMachineState;
  readonly effects: readonly Effect[];
}

export const INITIAL_CONTEXT: MachineContext = {
  selection: null,
  pendingSelection: null,
  activePointer: NO_POINTER_OWNER,
  dragTarget: null,
  resizeHandle: null,
} as const;

export const createInitialState = (): InteractionMachineState => ({
  value: "idle",
  context: INITIAL_CONTEXT,
});

/** Build a transition result that leaves the state unchanged and emits an error. */
export const illegalTransition = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => ({
  state,
  effects: [
    { kind: "error", error: { code: "illegal-transition", from: state.value, event: event.type } },
  ],
});

/** Return a transition result with no effects (idempotent no-op). */
export const noEffects = (state: InteractionMachineState): TransitionResult => ({
  state,
  effects: [],
});

/** Return a new state with patched context (and optionally a new value). */
export const withContext = (
  state: InteractionMachineState,
  patch: Partial<MachineContext>,
  value?: InteractionStateValue,
): InteractionMachineState => ({
  value: value ?? state.value,
  context: { ...state.context, ...patch },
});

/** Compile-time exhaustiveness guard for the state union. */
export const assertNeverState = (value: never): never => {
  throw new Error(`Unreachable interaction state: ${JSON.stringify(value)}`);
};

/**
 * End a pointer-owning gesture: release the pointer from context and return to
 * `selected`. The pointer id is read from the active owner (guaranteed non-null
 * in a pointer-owning state); a stray null leaves ownership unchanged.
 */
export const endGesture = (
  state: InteractionMachineState,
  kind: PointerOwnerKind,
  effects: readonly Effect[],
): TransitionResult => {
  const owner = state.context.activePointer.activeOwner;
  const released =
    owner === null
      ? state.context.activePointer
      : releasePointer(state.context.activePointer, owner.pointerId);
  const patch: Partial<MachineContext> =
    kind === "drag"
      ? { activePointer: released, dragTarget: null }
      : { activePointer: released, resizeHandle: null };
  return { state: withContext(state, patch, "selected"), effects };
};

/** Deselect: clear selection/pending and return to `idle`. */
export const deselect = (state: InteractionMachineState): TransitionResult => ({
  state: withContext(state, { selection: null, pendingSelection: null }, "idle"),
  effects: [{ kind: "close-inspector" }, { kind: "hide-outline" }],
});

/**
 * Reject a pointer-owning start because the pointer is already owned. Emits a
 * `pointer-busy` error when an owner is active (the one-pointer invariant); a
 * null owner is unreachable in a pointer-owning state and degrades to an
 * illegal-transition error rather than crashing.
 */
export const rejectPointerBusy = (
  state: InteractionMachineState,
  attempted: PointerOwnerKind,
): TransitionResult => {
  const owner = state.context.activePointer.activeOwner;
  if (owner === null) {
    const eventType = attempted === "drag" ? "drag-start" : "resize-start";
    return {
      state,
      effects: [
        {
          kind: "error",
          error: { code: "illegal-transition", from: state.value, event: eventType },
        },
      ],
    };
  }
  return {
    state,
    effects: [{ kind: "error", error: { code: "pointer-busy", current: owner, attempted } }],
  };
};
