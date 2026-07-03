import type { ElementRef } from "@vision-control/element-identity";
import type { Point } from "@vision-control/geometry";

import type { InteractionEvent, InteractionEventType, PreviewKind } from "./events.js";
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
 *
 * Every field that can hold a runtime id (`selection`, `pendingSelection`,
 * `dragTarget`) is cleared by `page-reload` so no stale id survives a reload
 * (PRD 10 invariant 5).
 */
export interface MachineContext {
  /** The committed selection (inspector target). Null until `selected`. */
  readonly selection: ElementRef | null;
  /** The pending target while `hovering`/`awaiting-commit`, before commit. */
  readonly pendingSelection: ElementRef | null;
  /** Pointer ownership snapshot — enforces the one-owner invariant. */
  readonly activePointer: PointerOwnershipState;
  /** Element being dragged. Set on `drag-start`, cleared on `drag-end`. */
  readonly dragTarget: ElementRef | null;
  /** Active resize handle. Set on `resize-start`, cleared on `resize-end`. */
  readonly resizeHandle: import("./events.js").ResizeHandle | null;
  /** Active preview kind while inside a `selected.dragging.*-preview` leaf. */
  readonly previewKind: PreviewKind | null;
}

export interface InteractionMachineState {
  readonly value: InteractionStateValue;
  readonly context: MachineContext;
}

/**
 * Side-effect description emitted by a transition. The machine NEVER touches the
 * DOM; browser packages interpret these and perform the actual mutation
 * (show/hide outline, begin/end drag, open/close inspector, preview lifecycle,
 * verification, connection, runtime-id discard).
 */
export type Effect =
  | { readonly kind: "show-outline"; readonly target: ElementRef }
  | { readonly kind: "hide-outline" }
  | { readonly kind: "begin-drag"; readonly target: ElementRef; readonly pointerId: PointerId }
  | { readonly kind: "drag-confirmed" }
  | { readonly kind: "end-drag" }
  | { readonly kind: "move-drag-preview"; readonly delta: Point }
  | {
      readonly kind: "begin-resize";
      readonly handle: import("./events.js").ResizeHandle;
      readonly pointerId: PointerId;
    }
  | { readonly kind: "end-resize" }
  | { readonly kind: "begin-marquee"; readonly pointerId: PointerId }
  | { readonly kind: "end-marquee" }
  | { readonly kind: "open-inspector"; readonly target: ElementRef }
  | { readonly kind: "close-inspector" }
  | { readonly kind: "begin-preview" }
  | { readonly kind: "commit-preview" }
  | { readonly kind: "rollback-preview" }
  | { readonly kind: "begin-verify" }
  | { readonly kind: "end-verify" }
  | { readonly kind: "disconnect" }
  | { readonly kind: "reconnect" }
  | { readonly kind: "clear-runtime-ids" }
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
    }
  | {
      readonly code: "selection-locked";
      readonly from: InteractionStateValue;
    }
  | {
      readonly code: "preview-open";
      readonly from: InteractionStateValue;
      readonly event: InteractionEventType;
    };

/** Outcome of one transition call, for the debug/telemetry log (PRD 10:776). */
export type TransitionOutcome = "applied" | "rejected" | "no-op";

/**
 * Structured debug-log record emitted on EVERY transition (PRD section 10:
 * "state transitions are recorded in telemetry and debug log"). The machine is
 * pure; it EMITS this record and the consumer forwards it to telemetry. The
 * record is always present on {@link TransitionResult}, so "every transition
 * emits a debug log" is true at the type level.
 */
export interface TransitionLog {
  readonly from: InteractionStateValue;
  readonly to: InteractionStateValue;
  readonly event: InteractionEventType;
  readonly outcome: TransitionOutcome;
}

/** Internal result before the debug log is attached. Handlers return this. */
export interface RawResult {
  readonly state: InteractionMachineState;
  readonly effects: readonly Effect[];
}

export interface TransitionResult extends RawResult {
  readonly log: TransitionLog;
}

export const INITIAL_CONTEXT: MachineContext = {
  selection: null,
  pendingSelection: null,
  activePointer: NO_POINTER_OWNER,
  dragTarget: null,
  resizeHandle: null,
  previewKind: null,
} as const;

export const createInitialState = (): InteractionMachineState => ({
  value: "idle",
  context: INITIAL_CONTEXT,
});

/** Build a transition result that leaves the state unchanged and emits an error. */
export const illegalTransition = (
  state: InteractionMachineState,
  event: InteractionEvent,
): RawResult => ({
  state,
  effects: [
    { kind: "error", error: { code: "illegal-transition", from: state.value, event: event.type } },
  ],
});

/** Return a transition result with no effects (idempotent no-op). */
export const noEffects = (state: InteractionMachineState): RawResult => ({ state, effects: [] });

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

/** Attach the debug-log record to a raw result (PRD 10:776). Single exit point. */
export const attachLog = (
  prev: InteractionMachineState,
  event: InteractionEvent,
  raw: RawResult,
): TransitionResult => {
  const outcome: TransitionOutcome = raw.effects.some((e) => e.kind === "error")
    ? "rejected"
    : raw.state.value === prev.value
      ? "no-op"
      : "applied";
  return {
    state: raw.state,
    effects: raw.effects,
    log: { from: prev.value, to: raw.state.value, event: event.type, outcome },
  };
};

/** Deselect: clear selection/pending and return to `idle`. */
export const deselect = (state: InteractionMachineState): RawResult => ({
  state: withContext(state, { selection: null, pendingSelection: null }, "idle"),
  effects: [{ kind: "close-inspector" }, { kind: "hide-outline" }],
});

/**
 * End a pointer-owning gesture: release the pointer from context and return to
 * `selected`. The pointer id is read from the active owner (guaranteed non-null
 * in a pointer-owning state); a stray null leaves ownership unchanged.
 */
export const endGesture = (
  state: InteractionMachineState,
  kind: PointerOwnerKind,
  effects: readonly Effect[],
): RawResult => {
  const owner = state.context.activePointer.activeOwner;
  const released =
    owner === null
      ? state.context.activePointer
      : releasePointer(state.context.activePointer, owner.pointerId);
  const patch: Partial<MachineContext> =
    kind === "drag"
      ? { activePointer: released, dragTarget: null, previewKind: null }
      : { activePointer: released, resizeHandle: null };
  return { state: withContext(state, patch, "selected"), effects };
};

/**
 * Reject a pointer-acquire event because a pointer-owning gesture is already
 * active — the one-owner invariant (PRD 10 invariant 1). Emits `pointer-busy`
 * when an owner is active; a null owner is unreachable in a pointer-owning
 * state and degrades to an illegal-transition error rather than crashing.
 */
export const rejectPointerBusy = (
  state: InteractionMachineState,
  attempted: PointerOwnerKind,
): RawResult => {
  const owner = state.context.activePointer.activeOwner;
  if (owner === null) {
    const eventType: InteractionEventType = attempted === "drag" ? "drag-start" : "resize-start";
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

/**
 * Reject a selection-change event (e.g. `element-clicked`) while a drag/resize
 * gesture owns the pointer — PRD 10 invariant 2 ("no source selection change
 * during drag"). The state is unchanged; the error names the offending state.
 */
export const rejectSelectionLocked = (state: InteractionMachineState): RawResult => ({
  state,
  effects: [{ kind: "error", error: { code: "selection-locked", from: state.value } }],
});

/**
 * Reject a non-terminal event from inside a preview transaction — PRD 10
 * invariant 3 ("a preview transaction ends in commit or rollback"). Only
 * `preview-commit`, `preview-rollback`, `drag-move`, `drag-end`, `escape`, and
 * the environmental cancels may touch a preview state; anything else is
 * rejected with `preview-open`.
 */
export const rejectPreviewOpen = (
  state: InteractionMachineState,
  event: InteractionEvent,
): RawResult => ({
  state,
  effects: [
    { kind: "error", error: { code: "preview-open", from: state.value, event: event.type } },
  ],
});

/**
 * Hard reset to `disconnected` discarding every runtime id in context — PRD 10
 * invariant 5 ("page reload discards stale runtime ids"). Used by `page-reload`.
 * Takes no state: a reload discards everything, so the prior context is unused.
 */
export const hardResetDisconnected = (): RawResult => ({
  state: {
    value: "disconnected",
    context: { ...INITIAL_CONTEXT },
  },
  effects: [{ kind: "clear-runtime-ids" }, { kind: "disconnect" }],
});
