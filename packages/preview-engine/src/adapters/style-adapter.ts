/**
 * Style preview adapter: applies a StyleEditOperation as a CSS rule via the
 * stylesheet manager, targeting the element by its runtime ID.
 *
 * Also handles ResizeElementOperation (CSS dimension change) since it is
 * fundamentally a style rule application.
 */

import type { ResizeElementOperation, StyleEditOperation } from "@vision-control/change-ir";
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
