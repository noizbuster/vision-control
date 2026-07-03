import type { ReparentElementOperation } from "@vision-control/change-ir";
import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import {
  type ChildBox,
  computeInsertionIndex,
  type LayoutRole,
  type ValidateReparentResult,
  validateReparent,
} from "@vision-control/layout-engine";

import type { PointerId } from "../pointer-ownership.js";

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
 * Enriched element descriptor used by the reparent evaluator. Carries the
 * element reference plus the metadata needed for content-model guards and
 * risk analysis.
 */
export interface ReparentElementDescriptor {
  readonly ref: ElementRef;
  readonly tagName: string;
  readonly isPortal?: boolean;
  readonly isProvider?: boolean;
  readonly isRepeatedInstance?: boolean;
  readonly sourceFile?: string;
}

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
 * Risk kinds that lower source-patch confidence but do not block the preview.
 */
export type ReparentRiskKind =
  | "portal"
  | "repeated-instance"
  | "provider"
  | "source-file"
  | "content-model";

export interface ReparentRisk {
  readonly kind: ReparentRiskKind;
  readonly reason: string;
}

export type ReparentConfidence = "high" | "medium" | "low";

/**
 * Feasibility report shown in the panel. It is separate from the binary
 * valid/invalid drop evaluation so the UI can explain why an operation may be
 * risky even when it is structurally allowed.
 */
export interface FeasibilityReport {
  readonly canReparent: boolean;
  readonly confidence: ReparentConfidence;
  readonly risks: readonly ReparentRisk[];
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

const contentModelRisk = (parentTag: string, childTag: string): ReparentRisk => ({
  kind: "content-model",
  reason: `<${childTag}> is not a permitted direct child of <${parentTag}>`,
});

const buildFeasibility = (
  element: ReparentElementDescriptor,
  targetParent: ReparentElementDescriptor | null,
  contentModel: ValidateReparentResult,
): FeasibilityReport => {
  const risks: ReparentRisk[] = [];

  if (!contentModel.ok) {
    risks.push(contentModelRisk(contentModel.violation.parent, contentModel.violation.child));
  }
  if (element.isPortal) {
    risks.push({ kind: "portal", reason: "Dragged element originates from a portal" });
  }
  if (element.isRepeatedInstance) {
    risks.push({
      kind: "repeated-instance",
      reason: "Repeated runtime instance from the same source line",
    });
  }
  if (targetParent?.isProvider) {
    risks.push({ kind: "provider", reason: "Target parent is a provider/utility wrapper" });
  }
  if (element.sourceFile === undefined || targetParent?.sourceFile === undefined) {
    risks.push({ kind: "source-file", reason: "Missing source mapping for element or target" });
  }

  const canReparent = contentModel.ok;
  const confidence: ReparentConfidence =
    risks.length === 0 ? "high" : risks.some((r) => r.kind === "source-file") ? "low" : "medium";

  return { canReparent, confidence, risks };
};

const initialFeasibility: FeasibilityReport = {
  canReparent: false,
  confidence: "low",
  risks: [{ kind: "content-model", reason: "No drop target evaluated yet" }],
};

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

  const insertion = computeInsertionIndex(
    hovered.parent.ref,
    hovered.children,
    pointerX,
    pointerY,
    hovered.layoutRole,
  );

  const target: DropTarget = {
    parent: hovered.parent.ref,
    tagName: hovered.parent.tagName,
    index: insertion.index,
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

const newOperationId = (): string => globalThis.crypto.randomUUID();

/**
 * End the reparent gesture. If the current target is valid, produces a
 * `reparent-element` operation; otherwise returns a rejection.
 */
export const endReparent = (session: ReparentSession): ReparentResult => {
  const target = session.currentTarget;
  if (target === null || session.phase !== "dragging-over-valid-target") {
    return { status: "rejected", reason: "No valid drop target" };
  }

  const operation: ReparentElementOperation = {
    id: newOperationId(),
    timestamp: Date.now(),
    runtime: false,
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
