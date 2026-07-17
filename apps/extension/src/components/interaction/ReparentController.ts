import type {
  GroupReparentOperation,
  Operation,
  ReparentElementOperation,
} from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";
import {
  beginReparent,
  buildGroupReparentOperation,
  type CandidateContainer,
  cancelReparent,
  createPointerId,
  type DropValidity,
  endReparent,
  evaluateDropTarget,
  type FeasibilityReport,
  type ReparentElementDescriptor,
  type ReparentPhase,
  type ReparentResult,
  type ReparentSession,
} from "@vision-control/interaction-machine";
import {
  classifyGroupMove,
  type InsertionIndicator,
  type LayoutRole,
} from "@vision-control/layout-engine";
import type { PreviewManager } from "@vision-control/preview-engine";

export type {
  CandidateContainer,
  FeasibilityReport,
  ReparentElementDescriptor,
} from "@vision-control/interaction-machine";

export interface ReparentHighlightState {
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly validity: DropValidity;
  readonly warning: string | null;
  readonly insertion: InsertionIndicator;
}

export interface ReparentControllerState {
  readonly phase: ReparentPhase;
  readonly isActive: boolean;
  readonly feasibility: FeasibilityReport;
  readonly highlight: ReparentHighlightState | null;
  readonly lastResult: ReparentResult | null;
}

export interface ReparentControllerCallbacks {
  readonly onStateChange: (state: ReparentControllerState) => void;
  readonly onHighlight: (state: ReparentHighlightState | null) => void;
}

export interface ReparentControllerOptions {
  readonly callbacks: ReparentControllerCallbacks;
  readonly previewEngine?: PreviewManager | null;
  readonly journal?: { readonly record: (operation: Operation) => void } | null;
}

export interface ReparentController {
  readonly begin: (
    pointerId: string,
    element: ReparentElementDescriptor,
    sourceParent: ReparentElementDescriptor,
    sourceIndex: number,
  ) => void;
  readonly move: (
    pointerX: number,
    pointerY: number,
    candidateContainers: readonly CandidateContainer[],
  ) => void;
  readonly end: () => ReparentResult;
  readonly cancel: (reason: string) => void;
  readonly getState: () => ReparentControllerState;
  readonly reparentGroup: (
    group: MultiSelectGroup,
    sourceParent: ElementRef,
    sourceIndices: readonly number[],
    targetParent: ElementRef,
    targetIndices: readonly number[],
    targetRole: LayoutRole,
    ownershipRisk: boolean,
  ) => GroupReparentOperation | null;
}

const initialFeasibility: FeasibilityReport = {
  canReparent: false,
  sourcePatch: "agent-required",
  confidence: "low",
  risks: [{ kind: "content-model", reason: "No drop target evaluated yet" }],
};

const initialState: ReparentControllerState = {
  phase: "drag-pending",
  isActive: false,
  feasibility: initialFeasibility,
  highlight: null,
  lastResult: null,
};

const toHighlightState = (
  container: CandidateContainer,
  validity: DropValidity,
  reason: string | null,
  insertion: InsertionIndicator,
): ReparentHighlightState => ({
  rect: container.rect,
  validity,
  warning: reason,
  insertion,
});

const findContainer = (
  containers: readonly CandidateContainer[],
  runtimeId: string,
): CandidateContainer | null =>
  containers.find((c) => c.parent.ref.runtimeId === runtimeId) ?? null;

export function createReparentController(options: ReparentControllerOptions): ReparentController {
  const { callbacks, previewEngine = null, journal = null } = options;
  let session: ReparentSession | null = null;
  let state: ReparentControllerState = initialState;

  const emit = (): void => {
    callbacks.onStateChange(state);
    callbacks.onHighlight(state.highlight);
  };

  const applyPreview = (operation: ReparentElementOperation): void => {
    if (previewEngine !== null) {
      previewEngine.applyOperation(operation);
    }
  };

  const begin: ReparentController["begin"] = (pointerId, element, sourceParent, sourceIndex) => {
    session = beginReparent(createPointerId(pointerId), element, sourceParent, sourceIndex);
    state = {
      ...initialState,
      phase: session.phase,
      isActive: true,
      feasibility: session.feasibility,
    };
    emit();
  };

  const move: ReparentController["move"] = (pointerX, pointerY, candidateContainers) => {
    if (session === null) return;

    const { session: nextSession, evaluation } = evaluateDropTarget(
      session,
      pointerX,
      pointerY,
      candidateContainers,
    );
    session = nextSession;

    const highlight =
      evaluation.target === null
        ? null
        : toHighlightState(
            findContainer(candidateContainers, evaluation.target.parent.runtimeId) ?? {
              parent: { ref: evaluation.target.parent, tagName: evaluation.target.tagName },
              layoutRole: "normal-flow-block",
              rect: { x: pointerX, y: pointerY, width: 0, height: 0 },
              children: [],
            },
            evaluation.validity === "valid" ? "valid" : "invalid",
            evaluation.reason,
            evaluation.target.indicator,
          );

    state = {
      ...state,
      phase: nextSession.phase,
      feasibility: nextSession.feasibility,
      highlight,
    };

    emit();
  };

  const end: ReparentController["end"] = () => {
    if (session === null) {
      return { status: "rejected", reason: "No reparent session active" };
    }

    const result = endReparent(session);
    session = null;

    if (result.status === "committed") {
      applyPreview(result.operation);
      journal?.record(result.operation);
    }

    state = {
      ...initialState,
      lastResult: result,
    };
    emit();
    return result;
  };

  const cancel: ReparentController["cancel"] = (reason) => {
    if (session === null) return;

    cancelReparent(session, reason);
    session = null;
    state = {
      ...initialState,
      phase: "rejected",
      lastResult: { status: "rejected", reason },
    };
    emit();
  };

  const getState = (): ReparentControllerState => state;

  const reparentGroup: ReparentController["reparentGroup"] = (
    group,
    sourceParent,
    sourceIndices,
    targetParent,
    targetIndices,
    targetRole,
    ownershipRisk,
  ) => {
    const candidate = classifyGroupMove({
      sameParent: sourceParent.runtimeId === targetParent.runtimeId,
      sourceParentRole: targetRole,
      targetParentRole: targetRole,
      validContentModel: true,
      ownershipRisk,
    });
    if (candidate.kind !== "group-reparent") {
      return null;
    }

    const operation = buildGroupReparentOperation(
      group,
      sourceParent,
      sourceIndices,
      targetParent,
      targetIndices,
    );
    journal?.record(operation);
    return operation;
  };

  return { begin, move, end, cancel, getState, reparentGroup };
}
