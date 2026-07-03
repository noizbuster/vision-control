import type { ElementRef } from "@vision-control/element-identity";

import type { InteractionEvent, PreviewKind, ResizeHandle } from "../events.js";
import {
  endGesture,
  type InteractionMachineState,
  illegalTransition,
  type MachineContext,
  type RawResult,
  rejectPointerBusy,
  rejectPreviewOpen,
  withContext,
} from "../machine-types.js";
import { acquirePointer, type PointerId, type PointerOwnerKind } from "../pointer-ownership.js";
import type { InteractionStateValue } from "../states.js";
import { isPreviewState } from "../states.js";

/**
 * Handlers for the `selected` compound subtree (PRD section 10): the default
 * `selected` leaf plus `awaiting-commit`, `preparing-drag`, `dragging` (+ three
 * preview leaves), `resizing`, `editing-text`, `editing-style`, and
 * `marquee-selecting`. Invariants 2 and 3 are enforced here (mid-drag
 * selection change, and the preview commit-or-rollback terminal set).
 */

const previewLeafOf = (kind: PreviewKind): InteractionStateValue =>
  kind === "reorder"
    ? "selected.dragging.reorder-preview"
    : kind === "reparent"
      ? "selected.dragging.reparent-preview"
      : "selected.dragging.free-position-preview";

/** Acquire the pointer for a gesture start; reject on the one-owner invariant. */
const acquireOrReject = (
  state: InteractionMachineState,
  pointerId: PointerId,
  owner: PointerOwnerKind,
  onAcquired: (patch: Partial<MachineContext>) => RawResult,
): RawResult => {
  const acquired = acquirePointer(state.context.activePointer, pointerId, owner);
  if (!acquired.ok) {
    return rejectPointerBusy(state, owner);
  }
  return onAcquired({ activePointer: acquired.state });
};

const startDrag = (
  state: InteractionMachineState,
  pointerId: PointerId,
  target: ElementRef,
): RawResult =>
  acquireOrReject(state, pointerId, "drag", (patch) => ({
    state: withContext(state, { ...patch, dragTarget: target }, "selected.preparing-drag"),
    effects: [{ kind: "begin-drag", target, pointerId }],
  }));

const startResize = (
  state: InteractionMachineState,
  handle: ResizeHandle,
  pointerId: PointerId,
): RawResult =>
  acquireOrReject(state, pointerId, "resize", (patch) => ({
    state: withContext(state, { ...patch, resizeHandle: handle }, "selected.resizing"),
    effects: [{ kind: "begin-resize", handle, pointerId }],
  }));

const fromSelectedRest = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "element-clicked":
      return {
        state: withContext(
          state,
          { selection: event.target, pendingSelection: null },
          "selected.awaiting-commit",
        ),
        effects: [{ kind: "show-outline", target: event.target }, { kind: "close-inspector" }],
      };
    case "drag-start":
      return startDrag(state, event.pointerId, event.target);
    case "resize-start":
      return startResize(state, event.handle, event.pointerId);
    case "text-edit-start":
      return { state: withContext(state, {}, "selected.editing-text"), effects: [] };
    case "style-edit-start":
      return { state: withContext(state, {}, "selected.editing-style"), effects: [] };
    case "marquee-start":
      return acquireOrReject(state, event.pointerId, "drag", (patch) => ({
        state: withContext(state, patch, "selected.marquee-selecting"),
        effects: [{ kind: "begin-marquee", pointerId: event.pointerId }],
      }));
    case "verify-start":
      return { state: withContext(state, {}, "verifying"), effects: [{ kind: "begin-verify" }] };
    case "escape":
    case "deselect":
      return {
        state: withContext(state, { selection: null, pendingSelection: null }, "idle"),
        effects: [{ kind: "close-inspector" }, { kind: "hide-outline" }],
      };
    default:
      return illegalTransition(state, event);
  }
};

const fromAwaitingCommit = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  const pending = state.context.pendingSelection;
  switch (event.type) {
    case "pick-end":
      return pending === null
        ? illegalTransition(state, event)
        : {
            state: withContext(state, { selection: pending, pendingSelection: null }, "selected"),
            effects: [{ kind: "open-inspector", target: pending }],
          };
    case "element-clicked":
      return {
        state: withContext(state, { pendingSelection: event.target }, "selected.awaiting-commit"),
        effects: [{ kind: "show-outline", target: event.target }],
      };
    case "escape":
    case "deselect":
      return {
        state: withContext(state, { selection: null, pendingSelection: null }, "idle"),
        effects: [{ kind: "hide-outline" }],
      };
    default:
      return illegalTransition(state, event);
  }
};

const fromPreparingDrag = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "drag-threshold-exceeded":
      return {
        state: withContext(state, {}, "selected.dragging"),
        effects: [{ kind: "drag-confirmed" }],
      };
    case "drag-move":
      return { state, effects: [{ kind: "move-drag-preview", delta: event.delta }] };
    case "drag-end":
      return endGesture(state, "drag", [{ kind: "end-drag" }]);
    case "escape":
      return endGesture(state, "drag", [{ kind: "end-drag" }]);
    default:
      return illegalTransition(state, event);
  }
};

const fromDragging = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "drag-move":
      return { state, effects: [{ kind: "move-drag-preview", delta: event.delta }] };
    case "preview-start":
      return {
        state: withContext(state, { previewKind: event.kind }, previewLeafOf(event.kind)),
        effects: [{ kind: "begin-preview" }],
      };
    case "drag-end":
      return endGesture(state, "drag", [{ kind: "end-drag" }]);
    case "escape":
      return endGesture(state, "drag", [{ kind: "end-drag" }]);
    default:
      return illegalTransition(state, event);
  }
};

/**
 * Preview leaves (invariant 3): the ONLY legal exits are `preview-commit`,
 * `preview-rollback`, `drag-move`, `drag-end` (drop = commit), and `escape`
 * (rollback). Anything else is rejected with `preview-open`.
 */
const fromPreview = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "preview-commit":
      return endGesture(state, "drag", [{ kind: "commit-preview" }, { kind: "end-drag" }]);
    case "preview-rollback":
      return {
        state: withContext(state, { previewKind: null }, "selected.dragging"),
        effects: [{ kind: "rollback-preview" }],
      };
    case "drag-move":
      return { state, effects: [{ kind: "move-drag-preview", delta: event.delta }] };
    case "drag-end":
      return endGesture(state, "drag", [{ kind: "commit-preview" }, { kind: "end-drag" }]);
    case "escape":
      return endGesture(state, "drag", [{ kind: "rollback-preview" }, { kind: "end-drag" }]);
    default:
      return rejectPreviewOpen(state, event);
  }
};

const fromResizing = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "resize-end":
      return endGesture(state, "resize", [{ kind: "end-resize" }]);
    case "escape":
      return endGesture(state, "resize", [{ kind: "end-resize" }]);
    default:
      return illegalTransition(state, event);
  }
};

const fromEditingText = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "text-edit-end":
    case "escape":
      return { state: withContext(state, {}, "selected"), effects: [] };
    default:
      return illegalTransition(state, event);
  }
};

const fromEditingStyle = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "style-edit-end":
    case "escape":
      return { state: withContext(state, {}, "selected"), effects: [] };
    default:
      return illegalTransition(state, event);
  }
};

const fromMarqueeSelecting = (
  state: InteractionMachineState,
  event: InteractionEvent,
): RawResult => {
  switch (event.type) {
    case "marquee-end":
      return endGesture(state, "drag", [{ kind: "end-marquee" }]);
    case "escape":
      return endGesture(state, "drag", [{ kind: "end-marquee" }]);
    default:
      return illegalTransition(state, event);
  }
};

export const dispatchSelectedSubtree = (
  state: InteractionMachineState,
  event: InteractionEvent,
): RawResult => {
  if (isPreviewState(state.value)) {
    return fromPreview(state, event);
  }
  switch (state.value) {
    case "selected":
      return fromSelectedRest(state, event);
    case "selected.awaiting-commit":
      return fromAwaitingCommit(state, event);
    case "selected.preparing-drag":
      return fromPreparingDrag(state, event);
    case "selected.dragging":
      return fromDragging(state, event);
    case "selected.resizing":
      return fromResizing(state, event);
    case "selected.editing-text":
      return fromEditingText(state, event);
    case "selected.editing-style":
      return fromEditingStyle(state, event);
    case "selected.marquee-selecting":
      return fromMarqueeSelecting(state, event);
    default:
      // Unreachable for selected-subtree states (every non-preview leaf is
      // handled above; the dotted-string union can't be narrowed to `never`
      // here, so reject gracefully rather than asserting).
      return illegalTransition(state, event);
  }
};
