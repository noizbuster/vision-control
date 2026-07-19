import { inverseBase } from "./operation-inverse-base.js";
import type { Operation } from "./operations/index.js";

type LayoutOperation = Extract<
  Operation,
  {
    kind:
      | "reorder-child"
      | "reparent-element"
      | "multi-select-group"
      | "group-reorder"
      | "group-reparent"
      | "align-elements"
      | "distribute-elements"
      | "set-container-layout"
      | "set-child-sizing"
      | "grid-reorder"
      | "grid-span";
  }
>;

export const invertLayoutOperation = (operation: LayoutOperation): Operation => {
  const base = inverseBase(operation);
  switch (operation.kind) {
    case "reorder-child":
      return {
        ...base,
        kind: "reorder-child",
        confidence: operation.confidence,
        parent: operation.parent,
        child: operation.child,
        fromIndex: operation.toIndex,
        toIndex: operation.fromIndex,
      };
    case "reparent-element":
      return {
        ...base,
        kind: "reparent-element",
        confidence: operation.confidence,
        element: operation.element,
        sourceParent: operation.targetParent,
        sourceIndex: operation.targetIndex,
        targetParent: operation.sourceParent,
        targetIndex: operation.sourceIndex,
      };
    case "multi-select-group":
      return {
        ...base,
        kind: "multi-select-group",
        confidence: operation.confidence,
        targets: operation.previousTargets ?? [],
        groupId: operation.groupId,
        previousTargets: operation.targets,
      };
    case "group-reorder":
      return {
        ...base,
        kind: "group-reorder",
        confidence: operation.confidence,
        parent: operation.parent,
        children: operation.children,
        previousOrder: operation.newOrder,
        newOrder: operation.previousOrder,
      };
    case "group-reparent":
      return {
        ...base,
        kind: "group-reparent",
        confidence: operation.confidence,
        elements: operation.elements,
        sourceParent: operation.targetParent,
        sourceIndices: operation.targetIndices,
        targetParent: operation.sourceParent,
        targetIndices: operation.sourceIndices,
      };
    case "align-elements":
      return {
        ...base,
        kind: "align-elements",
        confidence: operation.confidence,
        targets: operation.targets,
        alignment: operation.alignment,
        previousValues: operation.newValues,
        newValues: operation.previousValues,
      };
    case "distribute-elements":
      return {
        ...base,
        kind: "distribute-elements",
        confidence: operation.confidence,
        targets: operation.targets,
        axis: operation.axis,
        mode: operation.mode,
        previousGaps: operation.newGaps,
        newGaps: operation.previousGaps,
      };
    case "set-container-layout":
      return {
        ...base,
        kind: "set-container-layout",
        confidence: operation.confidence,
        container: operation.container,
        property: operation.property,
        value: operation.previousValue ?? "",
        previousValue: operation.value,
      };
    case "set-child-sizing":
      return {
        ...base,
        kind: "set-child-sizing",
        confidence: operation.confidence,
        container: operation.container,
        childIndex: operation.childIndex,
        child: operation.child,
        sizing: operation.previousSizing ?? operation.sizing,
        previousSizing: operation.sizing,
        ...(operation.previousValue !== undefined || operation.value !== undefined
          ? { value: operation.previousValue, previousValue: operation.value }
          : {}),
      };
    case "grid-reorder":
      return {
        ...base,
        kind: "grid-reorder",
        confidence: operation.confidence,
        grid: operation.grid,
        child: operation.child,
        placement: operation.placement,
        fromIndex: operation.toIndex,
        toIndex: operation.fromIndex,
        ...(operation.newGridArea !== undefined || operation.previousGridArea !== undefined
          ? {
              previousGridArea: operation.newGridArea,
              newGridArea: operation.previousGridArea,
            }
          : {}),
      };
    case "grid-span":
      return {
        ...base,
        kind: "grid-span",
        confidence: operation.confidence,
        grid: operation.grid,
        child: operation.child,
        axis: operation.axis,
        fromSpan: operation.toSpan,
        toSpan: operation.fromSpan,
      };
    default: {
      const exhaustive: never = operation;
      throw new Error(`invertLayoutOperation: unhandled kind ${JSON.stringify(exhaustive)}`);
    }
  }
};
