/**
 * Structural preview adapter: applies reorder/reparent operations by directly
 * manipulating DOM structure. This is the riskiest preview because React's
 * reconciliation may revert the DOM change — the caller attaches a
 * ReconciliationObserver to detect that and switch to simulated ghost mode.
 *
 * Rollback restores the parent's original child order by re-appending the
 * snapshotted children (appendChild moves existing nodes, preserving order).
 */

import type { ReorderChildOperation, ReparentElementOperation } from "@vision-control/change-ir";

import type { PreviewDomAdapter } from "../dom-adapter.js";
import { noopRollback, type RollbackFn } from "./preview-adapter.js";

export type StructuralOperation = ReorderChildOperation | ReparentElementOperation;

export function applyReorderPreview(
  dom: PreviewDomAdapter,
  operation: ReorderChildOperation,
): RollbackFn {
  const parent = dom.resolveElement(operation.parent.runtimeId);
  if (parent === null) return noopRollback;

  const snapshot = Array.from(parent.children);
  const child = snapshot[operation.fromIndex];
  if (child === undefined) return noopRollback;

  // Remove-then-insert model: after removing the child, the remaining children
  // shift, and parent.children[toIndex] gives the correct insertion reference.
  parent.removeChild(child);
  const refNode = parent.children[operation.toIndex] ?? null;
  parent.insertBefore(child, refNode);

  return (): void => {
    for (const node of snapshot) {
      parent.appendChild(node);
    }
  };
}

export function applyReparentPreview(
  dom: PreviewDomAdapter,
  operation: ReparentElementOperation,
): RollbackFn {
  const element = dom.resolveElement(operation.element.runtimeId);
  const sourceParent = dom.resolveElement(operation.sourceParent.runtimeId);
  const targetParent = dom.resolveElement(operation.targetParent.runtimeId);
  if (element === null || sourceParent === null || targetParent === null) {
    return noopRollback;
  }

  const sourceSnapshot = Array.from(sourceParent.children);
  const targetSnapshot = Array.from(targetParent.children);

  sourceParent.removeChild(element);
  const refNode = targetParent.children[operation.targetIndex] ?? null;
  targetParent.insertBefore(element, refNode);

  return (): void => {
    // appendChild moves existing nodes, restoring original order in both parents
    for (const node of sourceSnapshot) {
      sourceParent.appendChild(node);
    }
    for (const node of targetSnapshot) {
      targetParent.appendChild(node);
    }
  };
}

export function applyStructuralPreview(
  dom: PreviewDomAdapter,
  operation: StructuralOperation,
): RollbackFn {
  switch (operation.kind) {
    case "reorder-child":
      return applyReorderPreview(dom, operation);
    case "reparent-element":
      return applyReparentPreview(dom, operation);
  }
}
