/**
 * Transform preview adapter: applies a runtime-only `transform: translate()`
 * for drag ghosts. This is NEVER source intent — it is a high-frequency
 * runtime mutation used during pointer drag to show element movement.
 *
 * The transform is applied via the stylesheet manager (CSS rule) rather than
 * inline style, so it composes cleanly with style previews and rolls back by
 * removing the rule.
 */

import type { StylesheetManager } from "../stylesheet-manager.js";
import { applyCssRule } from "../stylesheet-manager.js";
import type { RollbackFn } from "./preview-adapter.js";

export interface TransformPreviewInput {
  readonly runtimeId: string;
  readonly translateX: number;
  readonly translateY: number;
}

export function applyTransformPreview(
  stylesheet: StylesheetManager,
  input: TransformPreviewInput,
): RollbackFn {
  const declarations = `transform: translate(${input.translateX}px, ${input.translateY}px);`;
  return applyCssRule(stylesheet, input.runtimeId, declarations);
}
