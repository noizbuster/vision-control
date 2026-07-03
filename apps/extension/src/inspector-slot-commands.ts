import type {
  AlignElementsOperation,
  DistributeElementsOperation,
  GridReorderOperation,
  GridSpanOperation,
  Operation,
} from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef, MultiSelectMember } from "@vision-control/element-identity";
import type { AlignmentCommandKind } from "@vision-control/layout-engine";

import type { GridPlacementMessage } from "./messaging/index.js";

const newId = (): string => crypto.randomUUID();

const memberToRef = (member: MultiSelectMember): ElementRef => ({
  runtimeId: member.runtimeId,
  tagName: member.tagName,
  ...(member.selector !== undefined ? { selector: member.selector } : {}),
  ...(member.sourceId !== undefined ? { sourceId: member.sourceId } : {}),
});

const opBase = () => ({
  id: newId(),
  timestamp: Date.now(),
  runtime: false as const,
  origin: "property-panel" as const,
  confidence: 1,
});

/**
 * Map an alignment command kind to a journal operation carrying the selected
 * targets and the alignment/distribution discriminator. Per-element values are
 * resolved by the content-side preview layer (which owns live geometry); the
 * panel emits intent. Returns `null` for `match-size` (no operation kind).
 */
export function buildAlignmentOperation(
  group: MultiSelectGroup,
  kind: AlignmentCommandKind,
): Operation | null {
  const targets = group.members.map(memberToRef);

  switch (kind) {
    case "align-left":
    case "align-center":
    case "align-right":
    case "align-top":
    case "align-middle":
    case "align-bottom": {
      const alignment = kind.replace("align-", "") as
        | "left"
        | "center"
        | "right"
        | "top"
        | "middle"
        | "bottom";
      const op: AlignElementsOperation = {
        ...opBase(),
        kind: "align-elements",
        targets,
        alignment,
        previousValues: [],
        newValues: [],
      };
      return op;
    }
    case "distribute-horizontal":
    case "distribute-vertical": {
      const axis = kind === "distribute-horizontal" ? "horizontal" : "vertical";
      const op: DistributeElementsOperation = {
        ...opBase(),
        kind: "distribute-elements",
        targets,
        axis,
        mode: "space-between",
        previousGaps: [],
        newGaps: [],
      };
      return op;
    }
    case "equal-gap": {
      const op: DistributeElementsOperation = {
        ...opBase(),
        kind: "distribute-elements",
        targets,
        axis: "horizontal",
        mode: "equal-gap",
        previousGaps: [],
        newGaps: [],
      };
      return op;
    }
    case "match-size":
      return null;
  }
}

export function buildGridReorderOperation(
  state: GridPlacementMessage,
  choice: "dom-order" | "grid-area",
): GridReorderOperation {
  const reorder = state.reorderChoice;
  return {
    ...opBase(),
    kind: "grid-reorder",
    grid: state.gridContainer,
    child: state.child,
    placement: choice,
    fromIndex: reorder?.domOrder.fromIndex ?? 0,
    toIndex: reorder?.domOrder.toIndex ?? 0,
    ...(reorder?.gridArea.previousGridArea !== undefined
      ? { previousGridArea: reorder.gridArea.previousGridArea }
      : {}),
    ...(reorder?.gridArea.newGridArea !== undefined
      ? { newGridArea: reorder.gridArea.newGridArea }
      : {}),
  };
}

export function buildGridSpanOperation(
  state: GridPlacementMessage,
  axis: "column" | "row",
  toSpan: number,
): GridSpanOperation {
  const fromSpan =
    state.placement === null
      ? 1
      : axis === "column"
        ? state.placement.columnSpan
        : state.placement.rowSpan;
  return {
    ...opBase(),
    kind: "grid-span",
    grid: state.gridContainer,
    child: state.child,
    axis,
    fromSpan,
    toSpan,
  };
}
