/**
 * Grid-drag controller (plan task 4).
 *
 * Routes a CSS-Grid drag gesture to {@link ReorderController.reorderGrid},
 * which resolves the visual goal through `resolveGridIntent` (DOM-order vs
 * grid-area) and records a `grid-reorder` operation. The controller defaults
 * `userChoice` to `"unset"`, which `resolveGridIntent` resolves to a grid-area
 * placement — NEVER a silent DOM-order rewrite (PRD §9.3 / open question 9 /
 * layout-engine AGENTS.md). When the grid-area placement desyncs visual order
 * from DOM reading order, the a11y warning is surfaced by `reorderGrid` through
 * the `onDiagnostic` callback wired into the interaction controllers.
 *
 * This controller does NOT duplicate `reorderGrid`; it reuses it — the same
 * pattern as the group-move router reusing `reorderGroup` / `reparentGroup`
 * (plan task 3). The classification + accessibility guard live inside
 * `resolveGridIntent` / `reorderGrid`; this router only feeds the request.
 */

import type { GridReorderOperation } from "@vision-control/change-ir";
import type { ElementRef } from "@vision-control/element-identity";
import type { GridUserChoice } from "@vision-control/layout-engine";

import type { ReorderController } from "../components/interaction/ReorderController.js";

/**
 * Resolved grid drag intent supplied by the pointer-event handler. Mirrors the
 * fields {@link ReorderController.reorderGrid} consumes; `userChoice` defaults
 * to `"unset"` (grid-area) when the user made no explicit choice.
 */
export interface GridDragIntent {
  readonly grid: ElementRef;
  readonly child: ElementRef;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly previousGridArea?: string;
  readonly newGridArea: string;
  readonly accessibilitySemanticMatch: boolean;
  readonly visualMatchesReadingOrder: boolean;
  /** Defaults to `"unset"` (grid-area). `dom-order` requires `accessibilitySemanticMatch`. */
  readonly userChoice?: GridUserChoice;
}

/** Router result. `routed` carries the recorded grid-reorder operation. */
export type GridDragRouteResult =
  | { readonly kind: "routed"; readonly operation: GridReorderOperation }
  | { readonly kind: "rejected"; readonly reason: string; readonly message: string };

export interface GridDragController {
  /** Resolve and record a grid drag. The a11y warning is surfaced via `onDiagnostic`. */
  readonly route: (intent: GridDragIntent) => GridDragRouteResult;
}

export interface GridDragControllerOptions {
  readonly reorder: ReorderController;
}

export function createGridDragController(options: GridDragControllerOptions): GridDragController {
  const { reorder } = options;

  const route = (intent: GridDragIntent): GridDragRouteResult => {
    const operation = reorder.reorderGrid({
      grid: intent.grid,
      child: intent.child,
      fromIndex: intent.fromIndex,
      toIndex: intent.toIndex,
      ...(intent.previousGridArea !== undefined
        ? { previousGridArea: intent.previousGridArea }
        : {}),
      newGridArea: intent.newGridArea,
      userChoice: intent.userChoice ?? "unset",
      accessibilitySemanticMatch: intent.accessibilitySemanticMatch,
      visualMatchesReadingOrder: intent.visualMatchesReadingOrder,
    });
    if (operation === null) {
      return {
        kind: "rejected",
        reason: "reorder-grid-rejected",
        message: "grid reorder rejected (a11y semantics mismatch or unsupported intent)",
      };
    }
    return { kind: "routed", operation };
  };

  return { route };
}
