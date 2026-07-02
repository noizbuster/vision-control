import type { Operation, OperationKind } from "@vision-control/change-ir";
import type { ReactElement } from "react";

export interface OperationSummary {
  readonly subject: string;
  readonly from: string;
  readonly to: string;
  readonly variant: "set" | "add" | "remove";
}

/**
 * Reduce an operation to a compact before/after summary for the journal list.
 * Pure and unit-tested in isolation from rendering. The switch is exhaustive;
 * a new operation kind without a branch is a compile error.
 */
export function summarizeOperation(op: Operation): OperationSummary {
  switch (op.kind) {
    case "style-edit":
      return {
        subject: op.property,
        from: op.previousValue ?? "",
        to: op.value,
        variant: "set",
      };
    case "class-add":
      return { subject: op.className, from: "", to: op.className, variant: "add" };
    case "class-remove":
      return { subject: op.className, from: op.className, to: "", variant: "remove" };
    case "class-replace":
      return {
        subject: "class",
        from: op.oldClassName,
        to: op.newClassName,
        variant: "set",
      };
    case "text-edit":
      return {
        subject: "text",
        from: op.previousText ?? "",
        to: op.newText,
        variant: "set",
      };
    case "reorder-child":
      return {
        subject: "index",
        from: String(op.fromIndex),
        to: String(op.toIndex),
        variant: "set",
      };
    case "reparent-element":
      return {
        subject: "parent",
        from: `${op.sourceParent.runtimeId}[${op.sourceIndex}]`,
        to: `${op.targetParent.runtimeId}[${op.targetIndex}]`,
        variant: "set",
      };
    case "resize-element":
      return {
        subject: op.property,
        from: `${op.fromValue}${op.unit}`,
        to: `${op.toValue}${op.unit}`,
        variant: "set",
      };
    default: {
      const exhaustive: never = op;
      throw new Error(`summarizeOperation: unhandled kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

const KIND_LABEL: Record<OperationKind, string> = {
  "style-edit": "Style",
  "class-add": "Class",
  "class-remove": "Class",
  "class-replace": "Class",
  "text-edit": "Text",
  "reorder-child": "Reorder",
  "reparent-element": "Reparent",
  "resize-element": "Resize",
};

export function operationLabel(op: Operation): string {
  return KIND_LABEL[op.kind];
}

interface BeforeAfterSummaryProps {
  readonly operation: Operation;
}

export function BeforeAfterSummary({ operation }: BeforeAfterSummaryProps): ReactElement {
  const summary = summarizeOperation(operation);
  if (summary.variant === "add") {
    return (
      <code className="journal-summary journal-summary--add" data-testid="journal-summary">
        + {summary.to}
      </code>
    );
  }
  if (summary.variant === "remove") {
    return (
      <code className="journal-summary journal-summary--remove" data-testid="journal-summary">
        - {summary.from}
      </code>
    );
  }
  return (
    <code className="journal-summary" data-testid="journal-summary">
      <span className="journal-summary__subject">{summary.subject}</span>
      <span className="journal-summary__from">{summary.from}</span>
      <span className="journal-summary__arrow">{"->"}</span>
      <span className="journal-summary__to">{summary.to}</span>
    </code>
  );
}
