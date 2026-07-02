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
    default: {
      const exhaustive: never = op;
      throw new Error(`describeTarget: unhandled kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};
