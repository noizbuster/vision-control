import type { Effect, InteractionMachineState, RawResult } from "../machine-types.js";
import { endGesture } from "../machine-types.js";
import { isInDraggingSubtree, isPointerOwningState, isPreviewState } from "../states.js";

/**
 * iframe-navigation cancel — PRD section 10 invariant 4 ("iframe navigation
 * cancels the active interaction"). Any active pointer-owning gesture or open
 * preview transaction is rolled back and the pointer released, returning to
 * `selected` (selection preserved: the browser layer decides whether the
 * selected element survived the navigation). With no active gesture the event
 * is a no-op.
 *
 * A marquee acquires the pointer under the `drag` owner kind (see
 * {@link fromMarqueeSelecting}), so it is released through the drag path.
 */
export const cancelActiveGesture = (state: InteractionMachineState): RawResult => {
  if (!isPointerOwningState(state.value)) {
    return { state, effects: [] };
  }
  const effects: Effect[] = [];
  if (isPreviewState(state.value)) {
    effects.push({ kind: "rollback-preview" }, { kind: "end-drag" });
    return endGesture(state, "drag", effects);
  }
  if (isInDraggingSubtree(state.value) || state.value === "selected.preparing-drag") {
    effects.push({ kind: "end-drag" });
    return endGesture(state, "drag", effects);
  }
  if (state.value === "selected.resizing") {
    effects.push({ kind: "end-resize" });
    return endGesture(state, "resize", effects);
  }
  // selected.marquee-selecting — released via the drag owner kind.
  effects.push({ kind: "end-marquee" });
  return endGesture(state, "drag", effects);
};
