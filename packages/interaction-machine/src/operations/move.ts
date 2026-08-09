import { DRAG_THRESHOLD_PX, exceedsThreshold } from "../drag-threshold.js";
import type { PointerId } from "../pointer-ownership.js";
import { evaluateMoveCandidate } from "./move-evaluation.js";
import type {
  MoveCancelReason,
  MoveCandidate,
  MoveOperation,
  MoveResult,
  MoveSource,
  MoveState,
} from "./move-types.js";
import { buildReorderOperation, type ReorderTarget } from "./reorder.js";
import { buildReparentOperation } from "./reparent.js";

export type {
  MoveCancelReason,
  MoveCandidate,
  MoveDiagnostic,
  MoveDiagnosticCode,
  MoveEvaluation,
  MoveOperation,
  MoveResult,
  MoveSource,
  MoveState,
} from "./move-types.js";

export const beginMove = (source: MoveSource, pointerId: PointerId): MoveState => ({
  kind: "drag-pending",
  source,
  pointerId,
});

export const updateMove = (
  state: MoveState,
  point: { readonly x: number; readonly y: number },
  candidate: MoveCandidate | null,
): MoveState => {
  if (state.kind === "dropped" || state.kind === "committed" || state.kind === "cancelled") {
    return state;
  }
  if (
    state.kind === "drag-pending" &&
    !exceedsThreshold(state.source.startPoint, point, DRAG_THRESHOLD_PX)
  ) {
    return state;
  }

  const source = state.source;
  return {
    kind: "dragging",
    source,
    pointerId: state.pointerId,
    point,
    candidate,
    evaluation: evaluateMoveCandidate(source, point, candidate),
  };
};

export const endMove = (state: MoveState): MoveResult => {
  if (state.kind === "drag-pending") {
    return {
      operation: null,
      diagnostic: null,
      state: {
        kind: "committed",
        source: state.source,
        pointerId: state.pointerId,
        operation: null,
      },
    };
  }
  if (state.kind === "dropped" || state.kind === "committed" || state.kind === "cancelled") {
    return { state, operation: null, diagnostic: null };
  }
  if (state.evaluation.kind === "invalid") {
    return {
      operation: null,
      diagnostic: state.evaluation.diagnostic,
      state: {
        kind: "cancelled",
        source: state.source,
        pointerId: state.pointerId,
        reason: "invalid-drop",
        operation: null,
      },
    };
  }

  const { candidate, insertion, intent } = state.evaluation;
  if (intent === "reorder" && insertion.index === state.source.sourceIndex) {
    return {
      operation: null,
      diagnostic: null,
      state: {
        kind: "committed",
        source: state.source,
        pointerId: state.pointerId,
        operation: null,
      },
    };
  }

  const operation: MoveOperation =
    intent === "reorder"
      ? buildReorderOperation(
          {
            element: state.source.element.ref,
            parent: state.source.sourceParent.ref,
            fromIndex: state.source.sourceIndex,
            startPoint: state.source.startPoint,
          } satisfies ReorderTarget,
          insertion.index,
        )
      : buildReparentOperation(
          state.source.element,
          state.source.sourceParent,
          state.source.sourceIndex,
          candidate.targetParent,
          insertion.index,
        );
  return {
    operation,
    diagnostic: null,
    state: { kind: "dropped", source: state.source, pointerId: state.pointerId, operation },
  };
};

export const commitMove = (state: MoveState): MoveState =>
  state.kind === "dropped"
    ? {
        kind: "committed",
        source: state.source,
        pointerId: state.pointerId,
        operation: state.operation,
      }
    : state;

export const cancelMove = (state: MoveState, reason: MoveCancelReason): MoveState =>
  state.kind === "drag-pending" || state.kind === "dragging" || state.kind === "dropped"
    ? {
        kind: "cancelled",
        source: state.source,
        pointerId: state.pointerId,
        reason,
        operation: null,
      }
    : state;
