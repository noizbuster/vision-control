/**
 * Text preview adapter: replaces the element's textContent. Rollback restores
 * the original text.
 *
 * CRITICAL: this directly mutates DOM text. In a React app, React's next
 * reconciliation pass may revert this change. That revert is acceptable for
 * text previews (the text will be re-applied by the source patch); the
 * structural adapter has the heavier reconciliation-observer fallback.
 */

import type { TextEditOperation } from "@vision-control/change-ir";

import type { PreviewDomAdapter } from "../dom-adapter.js";
import { noopRollback, type RollbackFn } from "./preview-adapter.js";

export function applyTextPreview(dom: PreviewDomAdapter, operation: TextEditOperation): RollbackFn {
  const element = dom.resolveElement(operation.target.runtimeId);
  if (element === null) return noopRollback;

  const original = element.textContent;
  element.textContent = operation.newText;

  return (): void => {
    element.textContent = original;
  };
}
