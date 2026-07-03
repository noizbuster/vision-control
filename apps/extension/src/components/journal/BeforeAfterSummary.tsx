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
    case "multi-select-group":
      return {
        subject: "group",
        from: String(op.previousTargets?.length ?? 0),
        to: String(op.targets.length),
        variant: "set",
      };
    case "group-reorder":
      return {
        subject: "group-order",
        from: op.previousOrder.join(","),
        to: op.newOrder.join(","),
        variant: "set",
      };
    case "group-reparent":
      return {
        subject: "group-parent",
        from: op.sourceParent.runtimeId,
        to: op.targetParent.runtimeId,
        variant: "set",
      };
    case "align-elements":
      return { subject: "align", from: "", to: op.alignment, variant: "set" };
    case "distribute-elements":
      return { subject: "distribute", from: "", to: `${op.axis}/${op.mode}`, variant: "set" };
    case "set-container-layout":
      return {
        subject: op.property,
        from: op.previousValue ?? "",
        to: op.value,
        variant: "set",
      };
    case "set-child-sizing":
      return {
        subject: `child[${op.childIndex}]:sizing`,
        from: op.previousSizing ?? "",
        to: op.sizing,
        variant: "set",
      };
    case "grid-reorder":
      return {
        subject: `grid:${op.placement}`,
        from: String(op.fromIndex),
        to: String(op.toIndex),
        variant: "set",
      };
    case "grid-span":
      return {
        subject: `grid-span:${op.axis}`,
        from: String(op.fromSpan),
        to: String(op.toSpan),
        variant: "set",
      };
    case "breakpoint-style-edit":
      return {
        subject: `${op.property}@${op.breakpoint}`,
        from: op.previousValue ?? "",
        to: op.value,
        variant: "set",
      };
    case "breakpoint-class-edit":
      return {
        subject: `class@${op.breakpoint}`,
        from: op.oldClassName,
        to: op.newClassName,
        variant: "set",
      };
    case "breakpoint-text-edit":
      return {
        subject: `text@${op.breakpoint}`,
        from: op.previousText ?? "",
        to: op.newText,
        variant: "set",
      };
    case "screenshot-crop-ref":
      return { subject: "screenshot", from: "", to: op.artifactId, variant: "set" };
    case "suggested-diff":
      return { subject: "suggested-diff", from: "", to: op.confidence, variant: "set" };
    case "set-component-prop":
      return {
        subject: `${op.componentName}.${op.propName}`,
        from: op.previousValue ?? "",
        to: op.value,
        variant: "set",
      };
    case "remove-style":
    case "set-attribute":
    case "position-element":
    case "insert-element":
    case "remove-element":
    case "duplicate-element":
    case "wrap-elements":
    case "unwrap-element":
      throw new Error(`summarizeOperation: not yet implemented for ${op.kind}`);
    default: {
      const exhaustive: never = op;
      throw new Error(`summarizeOperation: unhandled kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

const KIND_LABEL: Record<OperationKind, string> = {
  "style-edit": "Style",
  "remove-style": "Remove style",
  "class-add": "Class",
  "class-remove": "Class",
  "class-replace": "Class",
  "set-attribute": "Attribute",
  "text-edit": "Text",
  "reorder-child": "Reorder",
  "reparent-element": "Reparent",
  "position-element": "Position",
  "resize-element": "Resize",
  "multi-select-group": "Multi-select",
  "group-reorder": "Group reorder",
  "group-reparent": "Group reparent",
  "align-elements": "Align",
  "distribute-elements": "Distribute",
  "set-container-layout": "Container layout",
  "set-child-sizing": "Child sizing",
  "grid-reorder": "Grid reorder",
  "grid-span": "Grid span",
  "insert-element": "Insert",
  "remove-element": "Remove",
  "duplicate-element": "Duplicate",
  "wrap-elements": "Wrap",
  "unwrap-element": "Unwrap",
  "breakpoint-style-edit": "BP style",
  "breakpoint-class-edit": "BP class",
  "breakpoint-text-edit": "BP text",
  "screenshot-crop-ref": "Screenshot",
  "suggested-diff": "Suggested diff",
  "set-component-prop": "Component prop",
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
