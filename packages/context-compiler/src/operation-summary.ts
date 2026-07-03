/**
 * Reduces a change-IR {@link Operation} to an agent-facing
 * {@link OperationSummary}: kind, runtime flag, a human-readable one-liner, a
 * best-effort target label, and a lossy detail map.
 *
 * The kind switch is exhaustive — adding an operation kind to change-ir without
 * a branch here is a compile error, which keeps the context schema and the IR
 * locked in step.
 */

import type { Operation } from "@vision-control/change-ir";

import type { OperationSummary, OperationSummaryKind } from "./context-schema.js";

/** Reduce a change-IR operation to its agent-facing summary. */
export const summarizeOperation = (op: Operation): OperationSummary => {
  const kind = op.kind as OperationSummaryKind;
  const { description, detail } = describeOperation(op);
  return {
    id: op.id,
    kind,
    runtime: op.runtime,
    description,
    target: describeTarget(op),
    detail,
  };
};

/** Human-readable one-liner + lossy detail map per operation kind (exhaustive). */
const describeOperation = (
  op: Operation,
): { description: string; detail: Record<string, string> } => {
  switch (op.kind) {
    case "style-edit":
      return {
        description: `Set ${op.property} to ${describeValue(op.value)}${op.important ? " !important" : ""}`,
        detail: { property: op.property, value: op.value, important: String(op.important) },
      };
    case "class-add":
      return {
        description: `Add class ${describeValue(op.className)}`,
        detail: { className: op.className },
      };
    case "class-remove":
      return {
        description: `Remove class ${describeValue(op.className)}`,
        detail: { className: op.className },
      };
    case "class-replace":
      return {
        description: `Replace class ${describeValue(op.oldClassName)} with ${describeValue(op.newClassName)}`,
        detail: { oldClassName: op.oldClassName, newClassName: op.newClassName },
      };
    case "text-edit":
      return {
        description: `Change text to ${describeValue(op.newText)}`,
        detail: { newText: op.newText },
      };
    case "reorder-child":
      return {
        description: `Move child from index ${op.fromIndex} to ${op.toIndex}`,
        detail: { fromIndex: String(op.fromIndex), toIndex: String(op.toIndex) },
      };
    case "reparent-element":
      return {
        description: "Move element to a new parent",
        detail: { sourceIndex: String(op.sourceIndex), targetIndex: String(op.targetIndex) },
      };
    case "resize-element":
      return {
        description: `Resize ${op.property} from ${op.fromValue} to ${op.toValue}${op.unit}`,
        detail: {
          property: op.property,
          fromValue: op.fromValue,
          toValue: op.toValue,
          unit: op.unit,
        },
      };
    case "multi-select-group":
      return {
        description: `Select group ${op.groupId} (${op.targets.length} elements)`,
        detail: { groupId: op.groupId, targetCount: String(op.targets.length) },
      };
    case "group-reorder":
      return {
        description: `Reorder group of ${op.children.length} in ${op.parent.runtimeId}`,
        detail: { parent: op.parent.runtimeId, childCount: String(op.children.length) },
      };
    case "group-reparent":
      return {
        description: `Reparent ${op.elements.length} elements to ${op.targetParent.runtimeId}`,
        detail: {
          count: String(op.elements.length),
          targetParent: op.targetParent.runtimeId,
        },
      };
    case "align-elements":
      return {
        description: `Align ${op.targets.length} elements ${op.alignment}`,
        detail: { alignment: op.alignment, targetCount: String(op.targets.length) },
      };
    case "distribute-elements":
      return {
        description: `Distribute ${op.targets.length} elements ${op.axis} (${op.mode})`,
        detail: { axis: op.axis, mode: op.mode, targetCount: String(op.targets.length) },
      };
    case "set-container-layout":
      return {
        description: `Set container ${op.property} to ${describeValue(op.value)}`,
        detail: { property: op.property, value: op.value },
      };
    case "set-child-sizing":
      return {
        description: `Set child ${op.childIndex} sizing to ${op.sizing}`,
        detail: { childIndex: String(op.childIndex), sizing: op.sizing },
      };
    case "grid-reorder":
      return {
        description: `Grid reorder ${op.child.runtimeId} (${op.placement}) ${op.fromIndex}->${op.toIndex}`,
        detail: {
          grid: op.grid.runtimeId,
          placement: op.placement,
          fromIndex: String(op.fromIndex),
          toIndex: String(op.toIndex),
        },
      };
    case "grid-span":
      return {
        description: `Grid ${op.axis} span ${op.fromSpan}->${op.toSpan}`,
        detail: { axis: op.axis, fromSpan: String(op.fromSpan), toSpan: String(op.toSpan) },
      };
    case "breakpoint-style-edit":
      return {
        description: `Set ${op.property} to ${describeValue(op.value)} at ${op.breakpoint}`,
        detail: {
          breakpoint: op.breakpoint,
          property: op.property,
          value: op.value,
          important: String(op.important),
        },
      };
    case "breakpoint-class-edit":
      return {
        description: `Replace ${describeValue(op.oldClassName)} with ${describeValue(op.newClassName)} at ${op.breakpoint}`,
        detail: {
          breakpoint: op.breakpoint,
          oldClassName: op.oldClassName,
          newClassName: op.newClassName,
        },
      };
    case "breakpoint-text-edit":
      return {
        description: `Change text to ${describeValue(op.newText)} at ${op.breakpoint}`,
        detail: { breakpoint: op.breakpoint, newText: op.newText },
      };
    case "screenshot-crop-ref":
      return {
        description: `Reference screenshot artifact ${op.artifactId}`,
        detail: { artifactId: op.artifactId },
      };
    case "suggested-diff":
      return {
        description: `Suggested diff (${op.confidence} confidence, inert)`,
        detail: {
          confidence: op.confidence,
          applied: String(op.applied),
          preconditions: op.preconditions.join("; "),
        },
      };
    case "remove-style":
    case "set-attribute":
    case "position-element":
    case "insert-element":
    case "remove-element":
    case "duplicate-element":
    case "wrap-elements":
    case "unwrap-element":
      throw new Error(`describeOperation: summary not yet implemented for ${op.kind}`);
    default: {
      const exhaustive: never = op;
      throw new Error(`describeOperation: unhandled kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const describeValue = (value: string): string => {
  const trimmed = value.length > 60 ? `${value.slice(0, 60)}…` : value;
  return `"${trimmed}"`;
};

/** Best-effort target label for an operation (sourceId preferred over selector). */
const describeTarget = (op: Operation): string | undefined => {
  switch (op.kind) {
    case "style-edit":
    case "class-add":
    case "class-remove":
    case "class-replace":
    case "text-edit":
      return op.target.sourceId ?? op.target.selector;
    case "reorder-child":
      return op.child.sourceId ?? op.child.selector;
    case "reparent-element":
    case "resize-element":
      return op.element.sourceId ?? op.element.selector;
    case "set-container-layout":
      return op.container.sourceId ?? op.container.selector;
    case "set-child-sizing":
      return op.child.sourceId ?? op.child.selector;
    case "grid-reorder":
    case "grid-span":
      return op.child.sourceId ?? op.child.selector;
    case "group-reorder":
      return op.parent.sourceId ?? op.parent.selector;
    case "group-reparent":
      return op.targetParent.sourceId ?? op.targetParent.selector;
    case "multi-select-group":
    case "align-elements":
    case "distribute-elements":
      return op.targets[0]?.sourceId ?? op.targets[0]?.selector;
    case "screenshot-crop-ref":
      return op.target.sourceId ?? op.target.selector;
    case "breakpoint-style-edit":
    case "breakpoint-class-edit":
    case "breakpoint-text-edit":
      return op.target.sourceId ?? op.target.selector;
    case "suggested-diff":
      return op.target?.sourceId ?? op.target?.selector;
    case "remove-style":
    case "set-attribute":
    case "position-element":
    case "insert-element":
    case "remove-element":
    case "duplicate-element":
    case "wrap-elements":
    case "unwrap-element":
      throw new Error(`describeTarget: summary not yet implemented for ${op.kind}`);
    default: {
      const exhaustive: never = op;
      throw new Error(`describeTarget: unhandled kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};
