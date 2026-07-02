import type { ElementRef } from "@vision-control/element-identity";
import type { Point } from "@vision-control/geometry";

import type { PointerId } from "./pointer-ownership.js";

/**
 * Edge of a resize handle, in compass notation. A resize gesture starts from
 * one of these; the handle decides which dimension(s) the resize affects.
 */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Discriminated union of every transition event the interaction machine
 * accepts. Each event is a plain, JSON-safe value; the machine's reducer
 * inspects `type` to decide the transition.
 *
 * The event set is deliberately exhaustive of the MVP gesture lifecycle:
 * picker activation, click selection, drag start/move/end, resize start/end,
 * inline text editing, the preview transaction (commit/rollback), and the two
 * universal cancel signals (`escape`, `deselect`).
 */
export type InteractionEvent =
  | { readonly type: "pick-start" }
  | { readonly type: "pick-end" }
  | { readonly type: "element-clicked"; readonly target: ElementRef }
  | { readonly type: "drag-start"; readonly pointerId: PointerId; readonly target: ElementRef }
  | { readonly type: "drag-move"; readonly pointerId: PointerId; readonly delta: Point }
  | { readonly type: "drag-end"; readonly pointerId: PointerId }
  | { readonly type: "resize-start"; readonly handle: ResizeHandle; readonly pointerId: PointerId }
  | { readonly type: "resize-end" }
  | { readonly type: "text-edit-start" }
  | { readonly type: "text-edit-end" }
  | { readonly type: "preview-start" }
  | { readonly type: "preview-commit" }
  | { readonly type: "preview-rollback" }
  | { readonly type: "escape" }
  | { readonly type: "deselect" };

export type InteractionEventType = InteractionEvent["type"];
