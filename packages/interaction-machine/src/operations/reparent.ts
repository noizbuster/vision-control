import { createOperationId, type ReparentElementOperation } from "@vision-control/change-ir";
import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import {
  type ChildBox,
  computeInsertionIndex,
  computeLogicalInsertionIndex,
  type InsertionFlow,
  type InsertionIndicator,
  type LayoutRole,
  validateReparent,
} from "@vision-control/layout-engine";

import type { PointerId } from "../pointer-ownership.js";
import {
  buildFeasibility,
  type FeasibilityReport,
  initialFeasibility,
  type ReparentElementDescriptor,
} from "./reparent-feasibility.js";

// Re-export the feasibility taxonomy so the package barrel can source every
// reparent type from this module without touching the feasibility split.
export type {
  FeasibilityReport,
  ReparentConfidence,
  ReparentElementDescriptor,
  ReparentRisk,
  ReparentRiskKind,
  SourcePatchFeasibility,
} from "./reparent-feasibility.js";

/**
 * Lifecycle phases for a cross-parent reparent gesture.
 *
 * The state advances from `drag-pending` through target evaluation to either
 * `committed` or `rejected`. A drop on a valid target commits a
 * `reparent-element` operation; an invalid target or cancellation rejects it.
 */
export type ReparentPhase =
  | "drag-pending"
  | "dragging-over-valid-target"
  | "dragging-over-invalid-target"
  | "dropping"
  | "committed"
  | "rejected";

/**
 * A container that may receive the dragged element. The caller (a browser
 * adapter) supplies geometry, layout role, and tag name so the evaluator can
 * run content-model guards and compute an insertion index without touching
 * the DOM.
 */
export interface CandidateContainer {
  /** Parent descriptor including risk metadata. */
  readonly parent: ReparentElementDescriptor;
  readonly layoutRole: LayoutRole;
  readonly flow?: InsertionFlow;
  readonly flexDirection?: string;
  /** Container bounding rect in client coordinates. */
  readonly rect: Rect;
  /** In-flow children in DOM order, used for insertion-index computation. */
  readonly children: readonly ChildBox[];
}

/**
 * Resolved drop target after evaluation.
 */
export interface DropTarget {
  readonly parent: ElementRef;
  readonly tagName: string;
  readonly index: number;
  readonly indicator: InsertionIndicator;
}

export type DropValidity = "valid" | "invalid" | "pending";

/**
 * Result of evaluating the pointer position against candidate containers.
 */
export interface DropEvaluation {
  readonly validity: DropValidity;
  readonly target: DropTarget | null;
  readonly reason: string | null;
}

/**
 * Final outcome of a reparent gesture.
 */
export type ReparentResult =
  | { readonly status: "committed"; readonly operation: ReparentElementOperation }
  | { readonly status: "rejected"; readonly reason: string };

/**
 * Immutable session state for one reparent gesture.
 */
export interface ReparentSession {
  readonly phase: ReparentPhase;
  readonly pointerId: PointerId;
  readonly element: ReparentElementDescriptor;
  readonly sourceParent: ReparentElementDescriptor;
  readonly sourceIndex: number;
  readonly currentTarget: DropTarget | null;
  readonly feasibility: FeasibilityReport;
  readonly rejectionReason: string | null;
}

const pointInRect = (x: number, y: number, rect: Rect): boolean =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/**
 * Start a cross-parent reparent gesture. Captures source identity and index
 * so the operation can be inverted later.
 */
export const beginReparent = (
  pointerId: PointerId,
  element: ReparentElementDescriptor,
  sourceParent: ReparentElementDescriptor,
  sourceIndex: number,
): ReparentSession => ({
  phase: "drag-pending",
  pointerId,
  element,
  sourceParent,
  sourceIndex,
  currentTarget: null,
  feasibility: initialFeasibility,
  rejectionReason: null,
});

/**
 * Find the container under the pointer and evaluate whether the dragged
 * element may be dropped there.
 *
 * Returns `valid` only when the pointer is inside a candidate container AND
 * the content model allows the dragged element as a direct child. Invalid
 * drops carry a human-readable reason.
 */
export const evaluateDropTarget = (
  session: ReparentSession,
  pointerX: number,
  pointerY: number,
  candidateContainers: readonly CandidateContainer[],
): { readonly session: ReparentSession; readonly evaluation: DropEvaluation } => {
  const hovered = candidateContainers.find((c) => pointInRect(pointerX, pointerY, c.rect)) ?? null;

  if (hovered === null) {
    const evaluation: DropEvaluation = {
      validity: "pending",
      target: null,
      reason: "Pointer is not over a candidate container",
    };
    return {
      session: {
        ...session,
        phase: "drag-pending",
        currentTarget: null,
        feasibility: initialFeasibility,
      },
      evaluation,
    };
  }

  const contentModel = validateReparent(hovered.parent.tagName, session.element.tagName);
  const feasibility = buildFeasibility(session.element, null, contentModel);

  if (!contentModel.ok) {
    const evaluation: DropEvaluation = {
      validity: "invalid",
      target: null,
      reason: `${contentModel.violation.code}: ${contentModel.violation.reason}`,
    };
    return {
      session: {
        ...session,
        phase: "dragging-over-invalid-target",
        currentTarget: null,
        feasibility,
      },
      evaluation,
    };
  }

  const insertion =
    hovered.flow === undefined
      ? computeInsertionIndex(
          hovered.parent.ref,
          hovered.children,
          pointerX,
          pointerY,
          hovered.layoutRole,
          hovered.flexDirection ?? "",
        )
      : computeLogicalInsertionIndex({
          parent: hovered.parent.ref,
          children: hovered.children,
          pointer: { x: pointerX, y: pointerY },
          flow: hovered.flow,
        });

  const target: DropTarget = {
    parent: hovered.parent.ref,
    tagName: hovered.parent.tagName,
    index: insertion.index,
    indicator: insertion.indicator,
  };

  const evaluation: DropEvaluation = {
    validity: "valid",
    target,
    reason: null,
  };

  return {
    session: {
      ...session,
      phase: "dragging-over-valid-target",
      currentTarget: target,
      feasibility: buildFeasibility(session.element, hovered.parent, contentModel),
    },
    evaluation,
  };
};

/**
 * End the reparent gesture. If the current target is valid and the source
 * patch is not `unsafe`, produces a `reparent-element` operation; otherwise
 * returns a rejection.
 *
 * Per PRD §9.4:566, a reparent that fires an `unsafe` guard (a framework-
 * boundary crossing) must not auto-commit. {@link ReparentResult} is rejected
 * with a reason so the caller surfaces it to the user instead of silently
 * applying a preview.
 */
export const endReparent = (session: ReparentSession): ReparentResult => {
  const target = session.currentTarget;
  if (target === null || session.phase !== "dragging-over-valid-target") {
    return { status: "rejected", reason: "No valid drop target" };
  }

  if (session.feasibility.sourcePatch === "unsafe") {
    const kinds = session.feasibility.risks
      .map((r) => r.kind)
      .filter((k) => k !== "content-model")
      .join(", ");
    return {
      status: "rejected",
      reason: `Unsafe reparent boundary (${kinds}); agent review required`,
    };
  }

  const operation: ReparentElementOperation = {
    id: createOperationId(),
    timestamp: Date.now(),
    runtime: false,
    origin: "canvas-drag",
    confidence: 1,
    kind: "reparent-element",
    element: session.element.ref,
    sourceParent: session.sourceParent.ref,
    sourceIndex: session.sourceIndex,
    targetParent: target.parent,
    targetIndex: target.index,
  };

  return { status: "committed", operation };
};

/**
 * Cancel an in-flight reparent and record the cancellation reason.
 */
export const cancelReparent = (session: ReparentSession, reason: string): ReparentSession => ({
  ...session,
  phase: "rejected",
  rejectionReason: reason,
});
