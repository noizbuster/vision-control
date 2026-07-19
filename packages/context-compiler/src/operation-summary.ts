import type { Operation } from "@vision-control/change-ir";

import { buildLegacySummary, describeValue } from "./operation-summary-common.js";
import {
  summarizeAlignment,
  summarizeChildSizing,
  summarizeContainerLayout,
  summarizeDistribution,
  summarizeFlexPairResize,
  summarizeGridReorder,
  summarizeGridSpan,
  summarizeGroupReorder,
  summarizeGroupReparent,
  summarizeMultiSelect,
  summarizeReorder,
  summarizeReparent,
  summarizeResize,
} from "./operation-summary-layout.js";
import type { OperationSummary } from "./operation-summary-schema.js";
import {
  summarizeDuplicate,
  summarizeInsert,
  summarizeRemove,
  summarizeUnwrap,
  summarizeWrap,
} from "./operation-summary-structural.js";
import { targetLabel } from "./operation-summary-target.js";

export const summarizeOperation = (operation: Operation): OperationSummary => {
  switch (operation.kind) {
    case "style-edit":
      return buildLegacySummary(operation, {
        description: `Set ${operation.property} to ${describeValue(operation.value)}${operation.important ? " !important" : ""}`,
        detail: {
          property: operation.property,
          value: operation.value,
          important: String(operation.important),
        },
        target: targetLabel(operation.target),
      });
    case "remove-style":
      return buildLegacySummary(operation, {
        description: `Remove ${operation.property}`,
        detail: { property: operation.property },
        target: targetLabel(operation.target),
      });
    case "class-add":
      return buildLegacySummary(operation, {
        description: `Add class ${describeValue(operation.className)}`,
        detail: { className: operation.className },
        target: targetLabel(operation.target),
      });
    case "class-remove":
      return buildLegacySummary(operation, {
        description: `Remove class ${describeValue(operation.className)}`,
        detail: { className: operation.className },
        target: targetLabel(operation.target),
      });
    case "class-replace":
      return buildLegacySummary(operation, {
        description: `Replace class ${describeValue(operation.oldClassName)} with ${describeValue(operation.newClassName)}`,
        detail: { oldClassName: operation.oldClassName, newClassName: operation.newClassName },
        target: targetLabel(operation.target),
      });
    case "set-attribute":
      return buildLegacySummary(operation, {
        description: `Set attribute ${operation.name} to ${describeValue(operation.value)}`,
        detail: { name: operation.name, value: operation.value },
        target: targetLabel(operation.target),
      });
    case "text-edit":
      return buildLegacySummary(operation, {
        description: `Change text to ${describeValue(operation.newText)}`,
        detail: { newText: operation.newText },
        target: targetLabel(operation.target),
      });
    case "reorder-child":
      return summarizeReorder(operation);
    case "reparent-element":
      return summarizeReparent(operation);
    case "position-element":
      return buildLegacySummary(operation, {
        description: `Set ${operation.property} from ${operation.fromValue} to ${operation.toValue}`,
        detail: {
          property: operation.property,
          fromValue: operation.fromValue,
          toValue: operation.toValue,
        },
        target: targetLabel(operation.target),
      });
    case "resize-element":
      return summarizeResize(operation);
    case "resize-flex-pair":
      return summarizeFlexPairResize(operation);
    case "multi-select-group":
      return summarizeMultiSelect(operation);
    case "group-reorder":
      return summarizeGroupReorder(operation);
    case "group-reparent":
      return summarizeGroupReparent(operation);
    case "align-elements":
      return summarizeAlignment(operation);
    case "distribute-elements":
      return summarizeDistribution(operation);
    case "set-container-layout":
      return summarizeContainerLayout(operation);
    case "set-child-sizing":
      return summarizeChildSizing(operation);
    case "grid-reorder":
      return summarizeGridReorder(operation);
    case "grid-span":
      return summarizeGridSpan(operation);
    case "insert-element":
      return summarizeInsert(operation);
    case "remove-element":
      return summarizeRemove(operation);
    case "duplicate-element":
      return summarizeDuplicate(operation);
    case "wrap-elements":
      return summarizeWrap(operation);
    case "unwrap-element":
      return summarizeUnwrap(operation);
    case "breakpoint-style-edit":
      return buildLegacySummary(operation, {
        description: `Set ${operation.property} to ${describeValue(operation.value)} at ${operation.breakpoint}`,
        detail: {
          breakpoint: operation.breakpoint,
          property: operation.property,
          value: operation.value,
          important: String(operation.important),
        },
        target: targetLabel(operation.target),
      });
    case "breakpoint-class-edit":
      return buildLegacySummary(operation, {
        description: `Replace ${describeValue(operation.oldClassName)} with ${describeValue(operation.newClassName)} at ${operation.breakpoint}`,
        detail: {
          breakpoint: operation.breakpoint,
          oldClassName: operation.oldClassName,
          newClassName: operation.newClassName,
        },
        target: targetLabel(operation.target),
      });
    case "breakpoint-text-edit":
      return buildLegacySummary(operation, {
        description: `Change text to ${describeValue(operation.newText)} at ${operation.breakpoint}`,
        detail: { breakpoint: operation.breakpoint, newText: operation.newText },
        target: targetLabel(operation.target),
      });
    case "screenshot-crop-ref":
      return buildLegacySummary(operation, {
        description: `Reference screenshot artifact ${operation.artifactId}`,
        detail: { artifactId: operation.artifactId },
        target: targetLabel(operation.target),
      });
    case "suggested-diff":
      return buildLegacySummary(operation, {
        description: `Suggested diff (${operation.confidence} confidence, inert)`,
        detail: {
          confidence: operation.confidence,
          applied: String(operation.applied),
          preconditions: operation.preconditions.join("; "),
        },
        target: targetLabel(operation.target),
      });
    case "set-component-prop":
      return buildLegacySummary(operation, {
        description: `Set ${operation.componentName} prop ${operation.propName} to ${describeValue(operation.value)}`,
        detail: {
          componentName: operation.componentName,
          propName: operation.propName,
          value: operation.value,
          startLine: String(operation.sourceRange.startLine),
        },
        target: targetLabel(operation.target),
      });
    case "pseudo-style-edit":
      return buildLegacySummary(operation, {
        description: `Pseudo ${operation.pseudoTarget} ${operation.property}: ${describeValue(operation.value)}`,
        detail: {
          pseudoTarget: operation.pseudoTarget,
          property: operation.property,
          value: operation.value,
          important: String(operation.important),
        },
        target: targetLabel(operation.target),
      });
    default: {
      const exhaustive: never = operation;
      throw new Error(`summarizeOperation: unhandled kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};
