import { createOperationId, type ReorderChildOperation } from "@vision-control/change-ir";
import type { ElementRef } from "@vision-control/element-identity";
import type { Point } from "@vision-control/geometry";
import {
  type ChildBox,
  computeInsertionIndex,
  type InsertionResult,
  type LayoutRole,
} from "@vision-control/layout-engine";

import { DRAG_THRESHOLD_PX, exceedsThreshold } from "../drag-threshold.js";
import type { PointerId } from "../pointer-ownership.js";

/**
 * The element being reordered plus the context captured at drag start.
 * `startPoint` is the pointer position in client coordinates when the drag
 * began; it is used with the drag threshold to decide when a press becomes a
 * drag.
 */
export interface ReorderTarget {
  /** The child element that is being dragged. */
  readonly element: ElementRef;
  /** The shared parent; the reorder is constrained to this container. */
  readonly parent: ElementRef;
  /** The element's original index inside `parent`. */
  readonly fromIndex: number;
  /** Pointer position at drag start. */
  readonly startPoint: Point;
}

/**
 * Layout context supplied by the caller on each pointer move. The reorder
 * lifecycle never reads the DOM directly; it receives the measured children
 * and classified role and delegates midpoint insertion-index computation to
 * the layout engine.
 */
export interface ReorderLayoutContext {
  /** The containing element; must match `ReorderTarget.parent`. */
  readonly parent: ElementRef;
  /** Bounding boxes of every in-flow child, in DOM order. */
  readonly children: readonly ChildBox[];
  /** Classified role of the parent container. */
  readonly layoutRole: LayoutRole;
  /**
   * The parent's CSS `flex-direction`. Needed to derive the flow axis for a
   * `flex-container` role (direction is not encoded in the role).
   */
  readonly flexDirection?: string;
}

/**
 * Lifecycle of a same-parent reorder gesture.
 *
 * - `drag-pending`: pointer is down but has not yet crossed the drag threshold.
 * - `dragging`: threshold exceeded; the insertion index is being tracked.
 * - `dropped`: pointer released and a `reorder-child` operation has been built.
 * - `committed`: the operation has been applied to the preview/journal.
 */
export type ReorderState =
  | {
      readonly kind: "drag-pending";
      readonly target: ReorderTarget;
      readonly pointerId: PointerId;
    }
  | {
      readonly kind: "dragging";
      readonly target: ReorderTarget;
      readonly pointerId: PointerId;
      /** Current insertion index under the pointer. */
      readonly toIndex: number;
      /** Last computed indicator position for the overlay. */
      readonly insertion: InsertionResult;
    }
  | {
      readonly kind: "dropped";
      readonly target: ReorderTarget;
      readonly pointerId: PointerId;
      readonly operation: ReorderChildOperation;
    }
  | {
      readonly kind: "committed";
      readonly target: ReorderTarget;
      readonly pointerId: PointerId;
      readonly operation: ReorderChildOperation | null;
    };

/** Result of ending a reorder gesture. */
export interface ReorderResult {
  /** The source-intent operation, or null when the gesture was a click/in-place drop. */
  readonly operation: ReorderChildOperation | null;
  readonly state: ReorderState;
}

const buildOperation = (target: ReorderTarget, toIndex: number): ReorderChildOperation => ({
  id: createOperationId(),
  kind: "reorder-child",
  runtime: false,
  timestamp: Date.now(),
  origin: "canvas-drag",
  confidence: 1,
  parent: target.parent,
  child: target.element,
  fromIndex: target.fromIndex,
  toIndex,
});

const computeInsertion = (
  pointerX: number,
  pointerY: number,
  context: ReorderLayoutContext,
): InsertionResult =>
  computeInsertionIndex(
    context.parent,
    context.children,
    pointerX,
    pointerY,
    context.layoutRole,
    context.flexDirection ?? "",
  );

/**
 * Begin a same-parent reorder gesture. The returned state is `drag-pending`;
 * the caller should feed subsequent pointer moves to {@link updateReorder}.
 */
export const beginReorder = (target: ReorderTarget, pointerId: PointerId): ReorderState => ({
  kind: "drag-pending",
  target,
  pointerId,
});

/**
 * Update a reorder gesture with a new pointer position.
 *
 * - In `drag-pending`: compares the distance from `startPoint` to the current
 *   pointer against {@link DRAG_THRESHOLD_PX}. Below threshold the state stays
 *   `drag-pending`; at/above threshold it transitions to `dragging` and
 *   computes the first insertion index.
 * - In `dragging`: recomputes the insertion index from the supplied layout
 *   context and updates `toIndex`/`insertion`.
 * - Terminal states (`dropped`, `committed`) are returned unchanged.
 */
export const updateReorder = (
  state: ReorderState,
  pointerX: number,
  pointerY: number,
  context: ReorderLayoutContext,
): ReorderState => {
  const current: Point = { x: pointerX, y: pointerY };

  if (state.kind === "drag-pending") {
    if (!exceedsThreshold(state.target.startPoint, current, DRAG_THRESHOLD_PX)) {
      return state;
    }
    const insertion = computeInsertion(pointerX, pointerY, context);
    return {
      kind: "dragging",
      target: state.target,
      pointerId: state.pointerId,
      toIndex: insertion.index,
      insertion,
    };
  }

  if (state.kind === "dragging") {
    const insertion = computeInsertion(pointerX, pointerY, context);
    return {
      ...state,
      toIndex: insertion.index,
      insertion,
    };
  }

  return state;
};

/**
 * End a reorder gesture.
 *
 * - If the gesture never crossed the threshold, or the element was dropped in
 *   its original position, returns `null` for the operation and a `committed`
 *   state.
 * - If the element was moved to a new index, returns a `reorder-child`
 *   operation (`runtime: false`) and a `dropped` state. The caller should
 *   apply the preview and then call {@link commitReorder} to move to
 *   `committed`.
 */
export const endReorder = (state: ReorderState): ReorderResult => {
  if (state.kind === "drag-pending" || state.kind === "committed") {
    return {
      operation: null,
      state: {
        kind: "committed",
        target: state.target,
        pointerId: state.pointerId,
        operation: null,
      },
    };
  }

  if (state.kind === "dropped") {
    return { operation: state.operation, state };
  }

  if (state.toIndex === state.target.fromIndex) {
    return {
      operation: null,
      state: {
        kind: "committed",
        target: state.target,
        pointerId: state.pointerId,
        operation: null,
      },
    };
  }

  const operation = buildOperation(state.target, state.toIndex);
  return {
    operation,
    state: {
      kind: "dropped",
      target: state.target,
      pointerId: state.pointerId,
      operation,
    },
  };
};

/**
 * Mark a `dropped` reorder as `committed` after the caller has applied the
 * preview and recorded the operation in the journal.
 */
export const commitReorder = (state: ReorderState): ReorderState => {
  if (state.kind !== "dropped") {
    return state;
  }
  return {
    kind: "committed",
    target: state.target,
    pointerId: state.pointerId,
    operation: state.operation,
  };
};
