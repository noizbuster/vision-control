/**
 * Structural preview adapter: applies DOM-order moves (reorder/reparent/grid/
 * group) by directly manipulating DOM structure. This is the riskiest preview
 * because React's reconciliation may revert the DOM change — the caller
 * attaches a ReconciliationObserver to detect that and switch to simulated
 * ghost mode.
 *
 * Node-creating mutations (insert/remove/duplicate/wrap/unwrap) live in
 * mutation-adapter.ts and are dispatched through {@link applyStructuralPreview}.
 *
 * Rollback restores the parent's original child order by re-appending the
 * snapshotted children (appendChild moves existing nodes, preserving order).
 */

import type {
  GridReorderOperation,
  GroupReorderOperation,
  GroupReparentOperation,
  ReorderChildOperation,
  ReparentElementOperation,
} from "@vision-control/change-ir";

import type { PreviewDomAdapter } from "../dom-adapter.js";
import { applyStructuralMutationPreview, type MutationOperation } from "./mutation-adapter.js";
import { noopRollback, type RollbackFn } from "./preview-adapter.js";

export type StructuralMoveOperation =
  | ReorderChildOperation
  | ReparentElementOperation
  | GridReorderOperation
  | GroupReorderOperation
  | GroupReparentOperation;

export type StructuralOperation = StructuralMoveOperation | MutationOperation;

function moveChildToIndex(parent: Element, child: Element, toIndex: number): void {
  parent.removeChild(child);
  const refNode = parent.children[toIndex] ?? null;
  parent.insertBefore(child, refNode);
}

function restoreSnapshot(parent: Element, snapshot: readonly Element[]): void {
  for (const node of snapshot) parent.appendChild(node);
}

export function applyReorderPreview(
  dom: PreviewDomAdapter,
  operation: ReorderChildOperation,
): RollbackFn {
  const parent = dom.resolveElement(operation.parent.runtimeId);
  if (parent === null) return noopRollback;

  const snapshot = Array.from(parent.children);
  const child = snapshot[operation.fromIndex];
  if (child === undefined) return noopRollback;

  moveChildToIndex(parent, child, operation.toIndex);
  return (): void => restoreSnapshot(parent, snapshot);
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
    restoreSnapshot(sourceParent, sourceSnapshot);
    restoreSnapshot(targetParent, targetSnapshot);
  };
}

/**
 * grid-reorder with `placement: "dom-order"` mutates DOM order (same model as
 * reorder-child); `placement: "grid-area"` is a CSS placement handled by the
 * stylesheet in the manager, so it is a no-op here.
 */
export function applyGridReorderPreview(
  dom: PreviewDomAdapter,
  operation: GridReorderOperation,
): RollbackFn {
  if (operation.placement !== "dom-order") return noopRollback;

  const parent = dom.resolveElement(operation.grid.runtimeId);
  if (parent === null) return noopRollback;

  const snapshot = Array.from(parent.children);
  const child = dom.resolveElement(operation.child.runtimeId) ?? snapshot[operation.fromIndex];
  if (child === null || child === undefined) return noopRollback;

  moveChildToIndex(parent, child, operation.toIndex);
  return (): void => restoreSnapshot(parent, snapshot);
}

export function applyGroupReorderPreview(
  dom: PreviewDomAdapter,
  operation: GroupReorderOperation,
): RollbackFn {
  const parent = dom.resolveElement(operation.parent.runtimeId);
  if (parent === null) return noopRollback;

  const snapshot = Array.from(parent.children);
  // newOrder[i] = original index of the element that now sits at position i.
  const reordered = operation.newOrder
    .map((originalIndex) => snapshot[originalIndex])
    .filter((node): node is Element => node !== undefined);
  for (const node of reordered) parent.appendChild(node);

  return (): void => restoreSnapshot(parent, snapshot);
}

export function applyGroupReparentPreview(
  dom: PreviewDomAdapter,
  operation: GroupReparentOperation,
): RollbackFn {
  const sourceParent = dom.resolveElement(operation.sourceParent.runtimeId);
  const targetParent = dom.resolveElement(operation.targetParent.runtimeId);
  if (sourceParent === null || targetParent === null) return noopRollback;

  const sourceSnapshot = Array.from(sourceParent.children);
  const targetSnapshot = Array.from(targetParent.children);
  const nodes = operation.elements
    .map((ref) => dom.resolveElement(ref.runtimeId))
    .filter((el): el is Element => el !== null && el.parentElement === sourceParent);
  for (const node of nodes) targetParent.appendChild(node);

  return (): void => {
    restoreSnapshot(sourceParent, sourceSnapshot);
    restoreSnapshot(targetParent, targetSnapshot);
  };
}

export function applyStructuralMovePreview(
  dom: PreviewDomAdapter,
  operation: StructuralMoveOperation,
): RollbackFn {
  switch (operation.kind) {
    case "reorder-child":
      return applyReorderPreview(dom, operation);
    case "reparent-element":
      return applyReparentPreview(dom, operation);
    case "grid-reorder":
      return applyGridReorderPreview(dom, operation);
    case "group-reorder":
      return applyGroupReorderPreview(dom, operation);
    case "group-reparent":
      return applyGroupReparentPreview(dom, operation);
  }
}

export function applyStructuralPreview(
  dom: PreviewDomAdapter,
  operation: StructuralOperation,
): RollbackFn {
  switch (operation.kind) {
    case "reorder-child":
    case "reparent-element":
    case "grid-reorder":
    case "group-reorder":
    case "group-reparent":
      return applyStructuralMovePreview(dom, operation);
    case "insert-element":
    case "remove-element":
    case "duplicate-element":
    case "wrap-elements":
    case "unwrap-element":
      return applyStructuralMutationPreview(dom, operation);
  }
}
