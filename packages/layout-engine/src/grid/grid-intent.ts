/**
 * The user's explicit choice for a grid reorder, or `"unset"` when no choice
 * has been made. `"unset"` MUST default to a visual grid-area placement, never
 * a silent DOM rewrite (PRD open question 9 / constraint: do not silently
 * change DOM order when the visual goal is grid placement only).
 */
export type GridUserChoice = "dom-order" | "grid-area" | "unset";

/**
 * Pure input to {@link resolveGridIntent}. The caller (a browser controller)
 * supplies the inferred indices/areas and the two accessibility flags; this
 * module never reads the DOM or computed style.
 */
export interface GridIntentInput {
  readonly userChoice: GridUserChoice;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly previousGridArea?: string;
  readonly newGridArea: string;
  /**
   * True when a DOM-order reorder is semantically valid (the element's source
   * semantics / accessibility role tolerate a reading-order change). The
   * dom-order path is allowed ONLY when this is true.
   */
  readonly accessibilitySemanticMatch: boolean;
  /**
   * True when the target visual order matches the resulting DOM reading order.
   * Drives the accessibility warning on the grid-area path.
   */
  readonly visualMatchesReadingOrder: boolean;
}

/**
 * Resolved grid source intent. The `kind` values align with the change-ir
 * `GridPlacementSchema` (`"dom-order"` / `"grid-area"`) so a resolution maps
 * directly onto a `GridReorderOperation`'s `placement` field.
 */
export type GridIntentResolution =
  | {
      readonly kind: "dom-order";
      readonly fromIndex: number;
      readonly toIndex: number;
      readonly a11yWarning: string | null;
    }
  | {
      readonly kind: "grid-area";
      readonly previousGridArea?: string;
      readonly newGridArea: string;
      readonly a11yWarning: string | null;
    }
  | { readonly kind: "rejected"; readonly reason: string };

const READING_ORDER_WARNING =
  "Visual grid placement differs from DOM reading order; screen readers follow DOM order. Review accessibility before applying.";

const DOM_SEMANTICS_REASON =
  "DOM-order reorder requires matching accessibility/source semantics; use an explicit grid-area intent instead";

/**
 * Forward-pointer message used by `semantic-operations.ts` when a single-element
 * drag classifier hits a grid context. The classifier still returns the
 * `unsupported-grid` kind (so existing tests stay green), but the message now
 * points callers to this V1 grid-aware flow instead of the stale MVP "not
 * supported" wording. Surgical: the only consumer of this constant is the grid
 * branch of `classifySemanticIntent`.
 */
export const GRID_AWARE_FLOW_POINTER =
  "grid context detected; resolve through the V1 grid-aware flow (cell inference, DOM-order vs grid-area choice, accessibility guard) instead of reorder/reparent";

/**
 * Resolve a grid reorder's visual goal to a semantic source intent (PRD section
 * 15.5 / open question 9). Accessibility contract:
 *
 * - `dom-order` choice: allowed ONLY when `accessibilitySemanticMatch` is true.
 *   This is the accessibility-neutral path (DOM reading order follows the new
 *   visual position), so it carries no warning when permitted.
 * - `grid-area` choice: always produces a grid-area placement (DOM order is
 *   untouched). When the placement desyncs visual order from DOM reading order
 *   (`!visualMatchesReadingOrder`), an accessibility warning is attached.
 * - `unset` choice: NEVER silently rewrites DOM order. Defaults to a grid-area
 *   placement (with the reading-order warning when applicable).
 *
 * This function never emits an absolute-positioning instruction; the
 * misleading-success-output adversarial class is that a grid visual reorder
 * silently commits a DOM rewrite. That path is structurally closed.
 */
export const resolveGridIntent = (input: GridIntentInput): GridIntentResolution => {
  if (input.userChoice === "dom-order") {
    if (!input.accessibilitySemanticMatch) {
      return { kind: "rejected", reason: DOM_SEMANTICS_REASON };
    }
    if (input.fromIndex < 0 || input.toIndex < 0) {
      return { kind: "rejected", reason: "DOM-order reorder requires non-negative indices" };
    }
    return {
      kind: "dom-order",
      fromIndex: input.fromIndex,
      toIndex: input.toIndex,
      a11yWarning: null,
    };
  }

  // grid-area OR unset (unset defaults to grid-area — never a silent DOM rewrite).
  if (input.newGridArea.length === 0) {
    return { kind: "rejected", reason: "grid-area placement requires a non-empty area string" };
  }

  const a11yWarning = input.visualMatchesReadingOrder ? null : READING_ORDER_WARNING;
  const resolution: GridIntentResolution = {
    kind: "grid-area",
    newGridArea: input.newGridArea,
    a11yWarning,
  };
  if (input.previousGridArea !== undefined && input.previousGridArea.length > 0) {
    return { ...resolution, previousGridArea: input.previousGridArea };
  }
  return resolution;
};
