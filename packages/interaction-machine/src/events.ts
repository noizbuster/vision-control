import type { ElementRef } from "@vision-control/element-identity";
import type { Point } from "@vision-control/geometry";

import type { PointerId } from "./pointer-ownership.js";

/**
 * Edge of a resize handle, in compass notation. A resize gesture starts from
 * one of these; the handle decides which dimension(s) the resize affects.
 */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * The kind of drag preview transaction (PRD section 10 `dragging` children).
 * A preview transaction MUST end in `preview-commit` or `preview-rollback`
 * (invariant 3).
 */
export type PreviewKind = "reorder" | "reparent" | "free-position";

/**
 * Discriminated union of every transition event the interaction machine
 * accepts. Each event is a plain, JSON-safe value; the machine's reducer
 * inspects `type` to decide the transition.
 *
 * The event set covers the full PRD section 10 hierarchical lifecycle: picker
 * activation, click selection, the drag threshold model (`preparing-drag` ->
 * `dragging`), the three preview transactions, resize, inline text/style
 * editing, marquee selection, verification, connection lifecycle, and the two
 * environmental cancels (`iframe-navigate`, `page-reload`) plus the universal
 * `escape`/`deselect`.
 */
export type InteractionEvent =
  // picker / hover
  | { readonly type: "pick-start" }
  | { readonly type: "pick-end" }
  | { readonly type: "element-clicked"; readonly target: ElementRef }
  // drag lifecycle (preparing-drag -> dragging -> preview -> commit/rollback)
  | { readonly type: "drag-start"; readonly pointerId: PointerId; readonly target: ElementRef }
  | { readonly type: "drag-threshold-exceeded" }
  | { readonly type: "drag-move"; readonly pointerId: PointerId; readonly delta: Point }
  | { readonly type: "drag-end"; readonly pointerId: PointerId }
  // preview transaction
  | { readonly type: "preview-start"; readonly kind: PreviewKind }
  | { readonly type: "preview-commit" }
  | { readonly type: "preview-rollback" }
  // resize
  | { readonly type: "resize-start"; readonly handle: ResizeHandle; readonly pointerId: PointerId }
  | { readonly type: "resize-end" }
  // inline editing
  | { readonly type: "text-edit-start" }
  | { readonly type: "text-edit-end" }
  | { readonly type: "style-edit-start" }
  | { readonly type: "style-edit-end" }
  // marquee selection
  | { readonly type: "marquee-start"; readonly pointerId: PointerId }
  | { readonly type: "marquee-end" }
  // verification
  | { readonly type: "verify-start" }
  | { readonly type: "verify-end" }
  // connection lifecycle (disconnected compound)
  | { readonly type: "disconnect" }
  | { readonly type: "reconnect" }
  // environmental cancels (PRD 10 invariants 4 & 5)
  | { readonly type: "iframe-navigate" }
  | { readonly type: "page-reload" }
  // universal
  | { readonly type: "escape" }
  | { readonly type: "deselect" };

export type InteractionEventType = InteractionEvent["type"];

/**
 * Events that attempt to capture the pointer for a new gesture. The
 * one-owner-at-a-time invariant (PRD 10 invariant 1) rejects these while a
 * pointer-owning state is already active.
 */
export const POINTER_ACQUIRE_EVENTS: readonly InteractionEventType[] = [
  "drag-start",
  "resize-start",
  "marquee-start",
];

export const isPointerAcquireEvent = (type: InteractionEventType): boolean =>
  POINTER_ACQUIRE_EVENTS.includes(type);
