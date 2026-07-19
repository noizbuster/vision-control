import type {
  DuplicateElementOperation,
  InsertElementOperation,
  RemoveElementOperation,
  UnwrapElementOperation,
  WrapElementsOperation,
} from "@vision-control/change-ir";

import { buildLegacySummary } from "./operation-summary-common.js";
import type { LegacyOperationSummary } from "./operation-summary-schema.js";
import { targetLabel } from "./operation-summary-target.js";

export const summarizeInsert = (operation: InsertElementOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Insert ${operation.tagName} at index ${operation.index}`,
    detail: { tagName: operation.tagName, index: String(operation.index) },
    target: targetLabel(operation.element),
  });

export const summarizeRemove = (operation: RemoveElementOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Remove ${operation.tagName} from index ${operation.index}`,
    detail: { tagName: operation.tagName, index: String(operation.index) },
    target: targetLabel(operation.element),
  });

export const summarizeDuplicate = (operation: DuplicateElementOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Duplicate ${operation.tagName} at index ${operation.index}`,
    detail: { tagName: operation.tagName, index: String(operation.index) },
    target: targetLabel(operation.duplicate),
  });

export const summarizeWrap = (operation: WrapElementsOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Wrap ${operation.targets.length} elements in ${operation.tagName}`,
    detail: { tagName: operation.tagName, targetCount: String(operation.targets.length) },
    target: targetLabel(operation.wrapper),
  });

export const summarizeUnwrap = (operation: UnwrapElementOperation): LegacyOperationSummary =>
  buildLegacySummary(operation, {
    description: `Unwrap ${operation.tagName} containing ${operation.targets.length} elements`,
    detail: { tagName: operation.tagName, targetCount: String(operation.targets.length) },
    target: targetLabel(operation.wrapper),
  });
