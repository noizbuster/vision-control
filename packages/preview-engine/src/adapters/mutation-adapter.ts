/**
 * Structural mutation adapter: insert/remove/duplicate/wrap/unwrap operations
 * that CREATE or DESTROY DOM nodes (distinct from the move ops in
 * structural-adapter.ts which only REORDER existing nodes).
 *
 * New nodes are built via the resolved parent's `ownerDocument` (not the
 * PreviewDomAdapter, which exposes no createElement) so the adapter surface
 * stays stable. Preview-created nodes are intentionally NOT registered with the
 * adapter — they are transient and removed on rollback, so a stale registration
 * would outlive them.
 *
 * Every rollback restores the exact pre-mutation structure by re-inserting the
 * same node references at their original positions.

 * Rollback is defensive about `parentElement` because a framework
 * reconciliation may have already detached a node out from under the preview.
 */

import type {
  DuplicateElementOperation,
  InsertElementOperation,
  RemoveElementOperation,
  UnwrapElementOperation,
  WrapElementsOperation,
} from "@vision-control/change-ir";

import type { PreviewDomAdapter } from "../dom-adapter.js";
import { noopRollback, type RollbackFn } from "./preview-adapter.js";

export type MutationOperation =
  | InsertElementOperation
  | RemoveElementOperation
  | DuplicateElementOperation
  | WrapElementsOperation
  | UnwrapElementOperation;

export function applyInsertElementPreview(
  dom: PreviewDomAdapter,
  operation: InsertElementOperation,
): RollbackFn {
  const parent = dom.resolveElement(operation.parent.runtimeId);
  if (parent === null) return noopRollback;

  const node = parent.ownerDocument.createElement(operation.tagName);
  if (operation.attributes !== undefined) {
    for (const [name, value] of Object.entries(operation.attributes)) {
      node.setAttribute(name, value);
    }
  }
  const refNode = parent.children[operation.index] ?? null;
  parent.insertBefore(node, refNode);

  return (): void => {
    if (node.parentElement === parent) parent.removeChild(node);
  };
}

export function applyRemoveElementPreview(
  dom: PreviewDomAdapter,
  operation: RemoveElementOperation,
): RollbackFn {
  const parent = dom.resolveElement(operation.parent.runtimeId);
  const node = dom.resolveElement(operation.element.runtimeId);
  if (parent === null || node === null) return noopRollback;
  if (node.parentElement !== parent) return noopRollback;

  const nextSibling: Element | null = node.nextElementSibling;
  parent.removeChild(node);

  return (): void => {
    if (node.parentElement === null) parent.insertBefore(node, nextSibling);
  };
}

export function applyDuplicateElementPreview(
  dom: PreviewDomAdapter,
  operation: DuplicateElementOperation,
): RollbackFn {
  const source = dom.resolveElement(operation.source.runtimeId);
  const parent = dom.resolveElement(operation.parent.runtimeId);
  if (source === null || parent === null) return noopRollback;

  const clone = source.cloneNode(true) as Element;
  const refNode = parent.children[operation.index] ?? null;
  parent.insertBefore(clone, refNode);

  return (): void => {
    if (clone.parentElement === parent) parent.removeChild(clone);
  };
}

export function applyWrapElementsPreview(
  dom: PreviewDomAdapter,
  operation: WrapElementsOperation,
): RollbackFn {
  const parent = dom.resolveElement(operation.parent.runtimeId);
  if (parent === null) return noopRollback;

  const wrapper = parent.ownerDocument.createElement(operation.tagName);
  const targets = operation.targets
    .map((ref) => dom.resolveElement(ref.runtimeId))
    .filter((el): el is Element => el !== null && el.parentElement === parent);
  const firstTarget = targets[0];
  if (firstTarget === undefined) return noopRollback;

  parent.insertBefore(wrapper, firstTarget);
  for (const target of targets) wrapper.appendChild(target);

  return (): void => {
    for (const target of targets) parent.insertBefore(target, wrapper);
    if (wrapper.parentElement === parent) parent.removeChild(wrapper);
  };
}

export function applyUnwrapElementPreview(
  dom: PreviewDomAdapter,
  operation: UnwrapElementOperation,
): RollbackFn {
  const parent = dom.resolveElement(operation.parent.runtimeId);
  const wrapper = dom.resolveElement(operation.wrapper.runtimeId);
  if (parent === null || wrapper === null) return noopRollback;
  if (wrapper.parentElement !== parent) return noopRollback;

  const targets = operation.targets
    .map((ref) => dom.resolveElement(ref.runtimeId))
    .filter((el): el is Element => el !== null && el.parentElement === wrapper);
  for (const target of targets) parent.insertBefore(target, wrapper);
  parent.removeChild(wrapper);

  return (): void => {
    const firstTarget = targets[0] ?? null;
    parent.insertBefore(wrapper, firstTarget);
    for (const target of targets) wrapper.appendChild(target);
  };
}

export function applyStructuralMutationPreview(
  dom: PreviewDomAdapter,
  operation: MutationOperation,
): RollbackFn {
  switch (operation.kind) {
    case "insert-element":
      return applyInsertElementPreview(dom, operation);
    case "remove-element":
      return applyRemoveElementPreview(dom, operation);
    case "duplicate-element":
      return applyDuplicateElementPreview(dom, operation);
    case "wrap-elements":
      return applyWrapElementsPreview(dom, operation);
    case "unwrap-element":
      return applyUnwrapElementPreview(dom, operation);
  }
}
