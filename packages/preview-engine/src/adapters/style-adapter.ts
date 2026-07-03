/**
 * Style preview adapter: applies a StyleEditOperation as a CSS rule via the
 * stylesheet manager, targeting the element by its runtime ID.
 *
 * Also handles ResizeElementOperation (CSS dimension change) since it is
 * fundamentally a style rule application.
 */

import type {
  PositionElementOperation,
  RemoveStyleOperation,
  ResizeElementOperation,
  StyleEditOperation,
} from "@vision-control/change-ir";
import type { StylesheetManager } from "../stylesheet-manager.js";
import { applyCssRule } from "../stylesheet-manager.js";
import type { RollbackFn } from "./preview-adapter.js";

export function applyStylePreview(
  stylesheet: StylesheetManager,
  operation: StyleEditOperation,
): RollbackFn {
  const important = operation.important ? " !important" : "";
  const declarations = `${operation.property}: ${operation.value}${important};`;
  return applyCssRule(stylesheet, operation.target.runtimeId, declarations);
}

export function applyResizePreview(
  stylesheet: StylesheetManager,
  operation: ResizeElementOperation,
): RollbackFn {
  const declarations = `${operation.property}: ${operation.toValue}${operation.unit};`;
  return applyCssRule(stylesheet, operation.element.runtimeId, declarations);
}

/**
 * Remove-style preview: an inline declaration cannot be unset from outside the
 * element, so the preview overrides it with the prior value (or `unset`) via a
 * high-specificity `!important` rule. Rollback removes the rule.
 */
export function applyRemoveStylePreview(
  stylesheet: StylesheetManager,
  operation: RemoveStyleOperation,
): RollbackFn {
  const restoreValue = operation.previousValue ?? "unset";
  const important = operation.important ? " !important" : "";
  const declarations = `${operation.property}: ${restoreValue}${important};`;
  return applyCssRule(stylesheet, operation.target.runtimeId, declarations);
}

export function applyPositionElementPreview(
  stylesheet: StylesheetManager,
  operation: PositionElementOperation,
): RollbackFn {
  const declarations = `position: ${operation.toValue};`;
  return applyCssRule(stylesheet, operation.target.runtimeId, declarations);
}
