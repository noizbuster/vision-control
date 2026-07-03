import type { InteractionEvent, InteractionEventType } from "./events.js";
import { isPointerAcquireEvent } from "./events.js";
import { cancelActiveGesture } from "./handlers/cancel.js";
import { dispatchRootCompound } from "./handlers/root.js";
import { dispatchSelectedSubtree } from "./handlers/selected.js";
import {
  attachLog,
  hardResetDisconnected,
  INITIAL_CONTEXT,
  type InteractionMachineState,
  illegalTransition,
  type RawResult,
  rejectPointerBusy,
  rejectSelectionLocked,
  type TransitionResult,
  withContext,
} from "./machine-types.js";
import type { PointerOwnerKind } from "./pointer-ownership.js";
import { isPointerOwningState, topLevelOf } from "./states.js";

// allow: SIZE_OK — a state machine's invariant-guard ordering is indivisible;
// the global guards must be readable as one block (PRD 10 invariants 1-5) and
// the dispatch is a thin fan-out to the per-compound handlers. Splitting the
// guard chain across files would hide the invariant precedence from reviewers.
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
} from "./machine-types.js";

/** Map a pointer-acquire event to the owner kind it attempts to claim. */
const acquireKindOf = (type: InteractionEventType): PointerOwnerKind =>
  type === "resize-start" ? "resize" : "drag";

/** PRD 10 invariant 5 (page-reload) — handled first, from any state. */
const isPageReload = (event: InteractionEvent): boolean => event.type === "page-reload";

/** `disconnect` from any live state transitions to the `disconnected` sink. */
const goToDisconnected = (state: InteractionMachineState): RawResult => ({
  state: withContext(state, {}, "disconnected"),
  effects: [{ kind: "disconnect" }],
});

/** `reconnect` from `disconnected` resets to a clean `idle` (no stale selection). */
const reconnect = (): RawResult => ({
  state: { value: "idle", context: { ...INITIAL_CONTEXT } },
  effects: [{ kind: "reconnect" }],
});

/**
 * The transition function: a pure reducer. `(state, event) -> { state, effects, log }`.
 *
 * The five PRD section 10 invariants are enforced as global guards, evaluated
 * in precedence order BEFORE the per-compound dispatch:
 *
 * 1. one pointer-owning interaction at a time — a pointer-acquire event while a
 *    pointer-owning state is active is rejected with `pointer-busy`.
 * 2. no selection change mid-drag — `element-clicked` while pointer-owning is
 *    rejected with `selection-locked`.
 * 3. preview transaction commit-or-rollback — enforced inside the preview leaf
 *    handler (only terminal events are accepted; else `preview-open`).
 * 4. iframe-navigation cancels the active interaction — `iframe-navigate`
 *    rolls back any open preview and releases the pointer.
 * 5. page-reload discards runtime ids — `page-reload` hard-resets to
 *    `disconnected` clearing every runtime-id-bearing context field.
 *
 * Illegal transitions return the UNCHANGED state plus a single `error` effect.
 * Every transition — applied, rejected, or no-op — attaches a debug-log record
 * (PRD 10:776). The machine has no side effects.
 */
export const transition = (
  state: InteractionMachineState,
  event: InteractionEvent,
): TransitionResult => {
  const prev = state;
  let raw: RawResult;

  // Invariant 5: page-reload discards runtime ids (from ANY state).
  if (isPageReload(event)) {
    raw = hardResetDisconnected();
  } else if (state.value === "disconnected") {
    // `disconnected` is a sink: only `reconnect` exits (page-reload handled above).
    raw = event.type === "reconnect" ? reconnect() : illegalTransition(state, event);
  } else if (event.type === "iframe-navigate") {
    // Invariant 4: iframe-navigation cancels the active interaction.
    raw = cancelActiveGesture(state);
  } else if (event.type === "disconnect") {
    raw = goToDisconnected(state);
  } else if (isPointerAcquireEvent(event.type) && isPointerOwningState(state.value)) {
    // Invariant 1: one pointer-owning interaction at a time.
    raw = rejectPointerBusy(state, acquireKindOf(event.type));
  } else if (event.type === "element-clicked" && isPointerOwningState(state.value)) {
    // Invariant 2: no selection change mid-drag.
    raw = rejectSelectionLocked(state);
  } else {
    // Dispatch by PRD 10 compound state. `disconnected` is unreachable here
    // (handled as a sink above) but the dotted-string union can't express
    // that, so the explicit guard keeps the dispatch exhaustive.
    const compound = topLevelOf(state.value);
    if (compound === "selected") {
      raw = dispatchSelectedSubtree(state, event);
    } else if (compound === "disconnected") {
      raw = illegalTransition(state, event);
    } else {
      raw = dispatchRootCompound(compound, state, event);
    }
  }

  return attachLog(prev, event, raw);
};
