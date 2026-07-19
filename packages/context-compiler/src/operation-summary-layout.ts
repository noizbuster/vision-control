import type {
  AlignElementsOperation,
  DistributeElementsOperation,
  GridReorderOperation,
  GridSpanOperation,
  GroupReorderOperation,
  GroupReparentOperation,
  MultiSelectGroupOperation,
  ReorderChildOperation,
  ReparentElementOperation,
  ResizeElementOperation,
  ResizeFlexPairOperation,
  SetChildSizingOperation,
  SetContainerLayoutOperation,
} from "@vision-control/change-ir";

import { buildLegacySummary, describeValue } from "./operation-summary-common.js";
import type {
  LegacyOperationSummary,
  ResizeFlexPairOperationSummary,
} from "./operation-summary-schema.js";
import { durableTargetLabel, targetLabel } from "./operation-summary-target.js";

const cloneFlexState = (state: ResizeFlexPairOperation["members"][number]["before"]) => ({
  flex: { ...state.flex },
  usedMainSize: state.usedMainSize,
});

const cloneRect = (rect: ResizeFlexPairOperation["containerWitness"]["before"]) => ({ ...rect });

export const summarizeReorder = (operation: ReorderChildOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Move child from index ${operation.fromIndex} to ${operation.toIndex}`,
    detail: { fromIndex: String(operation.fromIndex), toIndex: String(operation.toIndex) },
    target: targetLabel(operation.child),
  });

export const summarizeReparent = (operation: ReparentElementOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: "Move element to a new parent",
    detail: {
      sourceIndex: String(operation.sourceIndex),
      targetIndex: String(operation.targetIndex),
    },
    target: targetLabel(operation.element),
  });

export const summarizeResize = (operation: ResizeElementOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Resize ${operation.property} from ${operation.fromValue} to ${operation.toValue}${operation.unit}`,
    detail: {
      property: operation.property,
      fromValue: operation.fromValue,
      toValue: operation.toValue,
      unit: operation.unit,
    },
    target: targetLabel(operation.element),
  });

export const summarizeFlexPairResize = (
  operation: ResizeFlexPairOperation,
): ResizeFlexPairOperationSummary => {
  const [primary, neighbor] = operation.members;
  return {
    id: operation.id,
    kind: operation.kind,
    runtime: operation.runtime,
    description: `Resize flex pair ${durableTargetLabel(primary.element)} and ${durableTargetLabel(neighbor.element)}`,
    target: durableTargetLabel(operation.target),
    detail: {
      target: { ...operation.target },
      container: { ...operation.container },
      members: [
        {
          role: primary.role,
          element: { ...primary.element },
          before: cloneFlexState(primary.before),
          after: cloneFlexState(primary.after),
        },
        {
          role: neighbor.role,
          element: { ...neighbor.element },
          before: cloneFlexState(neighbor.before),
          after: cloneFlexState(neighbor.after),
        },
      ],
      containerWitness: {
        before: cloneRect(operation.containerWitness.before),
        after: cloneRect(operation.containerWitness.after),
      },
      witnesses: operation.witnesses.map((witness) => ({
        element: { ...witness.element },
        before: cloneRect(witness.before),
        after: cloneRect(witness.after),
      })),
      witnessCount: operation.witnesses.length,
      axis: { ...operation.axis },
      delta: operation.delta,
    },
  };
};

export const summarizeMultiSelect = (
  operation: MultiSelectGroupOperation,
): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Select group ${operation.groupId} (${operation.targets.length} elements)`,
    detail: { groupId: operation.groupId, targetCount: String(operation.targets.length) },
    target: targetLabel(operation.targets[0]),
  });

export const summarizeGroupReorder = (operation: GroupReorderOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Reorder group of ${operation.children.length} in ${operation.parent.runtimeId}`,
    detail: { parent: operation.parent.runtimeId, childCount: String(operation.children.length) },
    target: targetLabel(operation.parent),
  });

export const summarizeGroupReparent = (operation: GroupReparentOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Reparent ${operation.elements.length} elements to ${operation.targetParent.runtimeId}`,
    detail: {
      count: String(operation.elements.length),
      targetParent: operation.targetParent.runtimeId,
    },
    target: targetLabel(operation.targetParent),
  });

export const summarizeAlignment = (operation: AlignElementsOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Align ${operation.targets.length} elements ${operation.alignment}`,
    detail: {
      alignment: operation.alignment,
      targetCount: String(operation.targets.length),
    },
    target: targetLabel(operation.targets[0]),
  });

export const summarizeDistribution = (
  operation: DistributeElementsOperation,
): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Distribute ${operation.targets.length} elements ${operation.axis} (${operation.mode})`,
    detail: {
      axis: operation.axis,
      mode: operation.mode,
      targetCount: String(operation.targets.length),
    },
    target: targetLabel(operation.targets[0]),
  });

export const summarizeContainerLayout = (
  operation: SetContainerLayoutOperation,
): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Set container ${operation.property} to ${describeValue(operation.value)}`,
    detail: { property: operation.property, value: operation.value },
    target: targetLabel(operation.container),
  });

export const summarizeChildSizing = (operation: SetChildSizingOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Set child ${operation.childIndex} sizing to ${operation.sizing}`,
    detail: { childIndex: String(operation.childIndex), sizing: operation.sizing },
    target: targetLabel(operation.child),
  });

export const summarizeGridReorder = (operation: GridReorderOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Grid reorder ${operation.child.runtimeId} (${operation.placement}) ${operation.fromIndex}->${operation.toIndex}`,
    detail: {
      grid: operation.grid.runtimeId,
      placement: operation.placement,
      fromIndex: String(operation.fromIndex),
      toIndex: String(operation.toIndex),
    },
    target: targetLabel(operation.child),
  });

export const summarizeGridSpan = (operation: GridSpanOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Grid ${operation.axis} span ${operation.fromSpan}->${operation.toSpan}`,
    detail: {
      axis: operation.axis,
      fromSpan: String(operation.fromSpan),
      toSpan: String(operation.toSpan),
    },
    target: targetLabel(operation.child),
  });
