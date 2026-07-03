/**
 * Class preview adapter: applies class add/remove/replace operations by
 * directly manipulating the element's classList. Rollback restores the
 * original className string.
 */

import type {
  BreakpointClassEditOperation,
  ClassAddOperation,
  ClassRemoveOperation,
  ClassReplaceOperation,
  SetAttributeOperation,
} from "@vision-control/change-ir";

import type { PreviewDomAdapter } from "../dom-adapter.js";
import { noopRollback, type RollbackFn } from "./preview-adapter.js";

export type ClassOperation = ClassAddOperation | ClassRemoveOperation | ClassReplaceOperation;

export function applyClassPreview(dom: PreviewDomAdapter, operation: ClassOperation): RollbackFn {
  const element = dom.resolveElement(operation.target.runtimeId);
  if (element === null) return noopRollback;

  const original = element.className;
  const list = element.classList;

  switch (operation.kind) {
    case "class-add":
      list.add(operation.className);
      break;
    case "class-remove":
      list.remove(operation.className);
      break;
    case "class-replace":
      list.remove(operation.oldClassName);
      list.add(operation.newClassName);
      break;
  }

  return (): void => {
    element.className = original;
  };
}

export function applySetAttributePreview(
  dom: PreviewDomAdapter,
  operation: SetAttributeOperation,
): RollbackFn {
  const element = dom.resolveElement(operation.target.runtimeId);
  if (element === null) return noopRollback;

  const hadAttribute = element.hasAttribute(operation.name);
  const previous = element.getAttribute(operation.name) ?? "";
  element.setAttribute(operation.name, operation.value);

  return (): void => {
    if (hadAttribute) {
      element.setAttribute(operation.name, previous);
    } else {
      element.removeAttribute(operation.name);
    }
  };
}

export function applyBreakpointClassEditPreview(
  dom: PreviewDomAdapter,
  operation: BreakpointClassEditOperation,
): RollbackFn {
  const element = dom.resolveElement(operation.target.runtimeId);
  if (element === null) return noopRollback;

  const original = element.className;
  element.classList.remove(operation.oldClassName);
  element.classList.add(operation.newClassName);

  return (): void => {
    element.className = original;
  };
}
