import {
  createOperationId,
  type GridReorderOperation,
  type GridSpanOperation,
  type GroupReorderOperation,
  type Operation,
  type ReorderChildOperation,
} from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";
import { buildGroupReorderOperation } from "@vision-control/interaction-machine";
import {
  classifyGroupMove,
  type GridUserChoice,
  type LayoutRole,
  resolveGridIntent,
} from "@vision-control/layout-engine";
import { PREVIEW_ID_ATTR } from "@vision-control/preview-engine";

export interface ReorderDiagnostic {
  readonly kind:
    | "unsupported-context"
    | "css-order-warning"
    | "unsupported-group-free-move"
    | "grid-a11y-warning"
    | "grid-reorder-rejected";
  readonly message: string;
}

export interface GridReorderRequest {
  readonly grid: ElementRef;
  readonly child: ElementRef;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly previousGridArea?: string;
  readonly newGridArea: string;
  readonly userChoice: GridUserChoice;
  readonly accessibilitySemanticMatch: boolean;
  readonly visualMatchesReadingOrder: boolean;
}

export interface GridSpanRequest {
  readonly grid: ElementRef;
  readonly child: ElementRef;
  readonly axis: "column" | "row";
  readonly fromSpan: number;
  readonly toSpan: number;
}

export interface ReorderCommandActions {
  readonly setMultiSelectGroup: (group: MultiSelectGroup | null) => void;
  readonly reorderGroup: (newOrder: readonly number[]) => GroupReorderOperation | null;
  readonly reorderGrid: (request: GridReorderRequest) => GridReorderOperation | null;
  readonly resizeGridSpan: (request: GridSpanRequest) => GridSpanOperation | null;
}

export const resolveKeyboardReorder = (input: {
  readonly direction: string;
  readonly fromIndex: number;
  readonly childCount: number;
  readonly parentRuntimeId: string;
  readonly childRuntimeId: string;
}): ReorderChildOperation | null => {
  let delta: -1 | 1;
  switch (input.direction) {
    case "ArrowUp":
    case "ArrowLeft":
      delta = -1;
      break;
    case "ArrowDown":
    case "ArrowRight":
      delta = 1;
      break;
    default:
      return null;
  }
  const toIndex = Math.max(0, Math.min(input.childCount - 1, input.fromIndex + delta));
  if (toIndex === input.fromIndex) return null;
  return {
    id: createOperationId(),
    kind: "reorder-child",
    runtime: false,
    timestamp: Date.now(),
    origin: "canvas-drag",
    confidence: 1,
    parent: { runtimeId: input.parentRuntimeId },
    child: { runtimeId: input.childRuntimeId },
    fromIndex: input.fromIndex,
    toIndex,
  };
};

export const createReorderCommandActions = (options: {
  readonly recordOperation: (operation: Operation) => void;
  readonly onDiagnostic: (diagnostic: ReorderDiagnostic) => void;
  readonly getParentLayoutRole: () => LayoutRole | null;
}): ReorderCommandActions => {
  let multiSelectGroup: MultiSelectGroup | null = null;

  const reorderGroup = (newOrder: readonly number[]): GroupReorderOperation | null => {
    const group = multiSelectGroup;
    if (group === null || group.commonParent === null) return null;
    const role = options.getParentLayoutRole() ?? "normal-flow-block";
    const candidate = classifyGroupMove({
      sameParent: true,
      sourceParentRole: role,
      targetParentRole: role,
      validContentModel: true,
    });
    if (candidate.kind === "unsupported-group-free-move") {
      options.onDiagnostic({ kind: "unsupported-group-free-move", message: candidate.message });
      return null;
    }
    if (candidate.kind !== "group-reorder") {
      options.onDiagnostic({
        kind: "unsupported-context",
        message: `group reorder not allowed in this context (${candidate.kind})`,
      });
      return null;
    }
    const previousOrder = group.members.map((member) => {
      const element = document.querySelector(`[${PREVIEW_ID_ATTR}="${member.runtimeId}"]`);
      if (element === null || element.parentElement === null) return -1;
      return Array.from(element.parentElement.children).indexOf(element);
    });
    if (previousOrder.some((index) => index < 0)) {
      options.onDiagnostic({
        kind: "unsupported-context",
        message: "one or more group members are no longer in the DOM (stale selection)",
      });
      return null;
    }
    const unchanged =
      previousOrder.length === newOrder.length &&
      previousOrder.every((value, index) => value === newOrder[index]);
    if (unchanged) return null;
    const operation = buildGroupReorderOperation(
      group,
      group.commonParent,
      previousOrder,
      newOrder,
    );
    options.recordOperation(operation);
    return operation;
  };

  const reorderGrid = (request: GridReorderRequest): GridReorderOperation | null => {
    const resolution = resolveGridIntent({
      userChoice: request.userChoice,
      fromIndex: request.fromIndex,
      toIndex: request.toIndex,
      ...(request.previousGridArea !== undefined
        ? { previousGridArea: request.previousGridArea }
        : {}),
      newGridArea: request.newGridArea,
      accessibilitySemanticMatch: request.accessibilitySemanticMatch,
      visualMatchesReadingOrder: request.visualMatchesReadingOrder,
    });
    if (resolution.kind === "rejected") {
      options.onDiagnostic({ kind: "grid-reorder-rejected", message: resolution.reason });
      return null;
    }
    if (resolution.a11yWarning !== null) {
      options.onDiagnostic({ kind: "grid-a11y-warning", message: resolution.a11yWarning });
    }
    const operation: GridReorderOperation = {
      id: createOperationId(),
      kind: "grid-reorder",
      runtime: false,
      timestamp: Date.now(),
      origin: "canvas-drag",
      confidence: 1,
      grid: request.grid,
      child: request.child,
      placement: resolution.kind,
      fromIndex: request.fromIndex,
      toIndex: request.toIndex,
      ...(resolution.kind === "grid-area" && resolution.previousGridArea !== undefined
        ? { previousGridArea: resolution.previousGridArea }
        : {}),
      ...(resolution.kind === "grid-area" ? { newGridArea: resolution.newGridArea } : {}),
    };
    options.recordOperation(operation);
    return operation;
  };

  const resizeGridSpan = (request: GridSpanRequest): GridSpanOperation | null => {
    if (request.fromSpan === request.toSpan || request.toSpan < 1) return null;
    const operation: GridSpanOperation = {
      id: createOperationId(),
      kind: "grid-span",
      runtime: false,
      timestamp: Date.now(),
      origin: "canvas-drag",
      confidence: 1,
      grid: request.grid,
      child: request.child,
      axis: request.axis,
      fromSpan: request.fromSpan,
      toSpan: request.toSpan,
    };
    options.recordOperation(operation);
    return operation;
  };

  return {
    setMultiSelectGroup: (group) => {
      multiSelectGroup = group;
    },
    reorderGroup,
    reorderGrid,
    resizeGridSpan,
  };
};
