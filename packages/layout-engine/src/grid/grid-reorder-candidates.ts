import type { GridCellPlacement } from "./grid-cell-inference.js";

/**
 * The user-visible choice between a DOM-order reorder and a visual grid-area
 * placement. This is the load-bearing accessibility fork for CSS Grid
 * (PRD open question 9 / section 15.5): a DOM-order reorder changes reading
 * order; a grid-area placement keeps DOM order and moves only the visual cell.
 *
 * `buildGridReorderCandidates` returns BOTH options so the inspector can
 * present them; {@link ./grid-intent.ts} resolves the chosen option into a
 * source intent and never silently rewrites DOM order.
 */
export interface GridReorderCandidateInput {
  /** The child's current inferred cell (source of `previousGridArea`). */
  readonly source: GridCellPlacement;
  /** The child's target inferred cell (source of `newGridArea`). */
  readonly target: GridCellPlacement;
  /** Original DOM index of the dragged child. */
  readonly fromIndex: number;
  /** Target DOM index (where the child would land under a DOM reorder). */
  readonly toIndex: number;
  /**
   * Explicit previous `grid-area` value from computed style, if any. When
   * absent the candidate string is derived from `source`.
   */
  readonly previousGridArea?: string;
  /**
   * Explicit target `grid-area` value, if any. When absent the candidate
   * string is derived from `target`.
   */
  readonly newGridArea?: string;
  /**
   * True when the target visual order matches the resulting DOM reading order.
   * Drives the accessibility flag on the grid-area option.
   */
  readonly visualMatchesReadingOrder?: boolean;
}

/** DOM-order reorder option. Changes reading order; accessibility-neutral. */
export interface DomOrderReorderCandidate {
  readonly kind: "dom-order-reorder";
  readonly fromIndex: number;
  readonly toIndex: number;
}

/** Visual grid-area placement option. Keeps DOM order; may desync reading order. */
export interface GridAreaPlacementCandidate {
  readonly kind: "grid-area-placement";
  readonly previousGridArea?: string;
  readonly newGridArea: string;
  /** False when the placement desyncs visual order from DOM reading order. */
  readonly a11ySafe: boolean;
}

/** Result of building the candidate set: both options plus a possible rejection. */
export interface GridReorderCandidateSet {
  readonly domOrder: DomOrderReorderCandidate;
  readonly gridArea: GridAreaPlacementCandidate;
  /** Non-null when the input is malformed (non-positive index, no-op drag). */
  readonly unsupported: { readonly message: string } | null;
}

/**
 * Render a CSS `grid-area` shorthand string (`row-start / col-start / row-end /
 * col-end`) from a placement. This is the value a `grid-area` source intent
 * would emit.
 */
const gridAreaString = (placement: GridCellPlacement): string =>
  `${placement.row} / ${placement.column} / ${placement.rowEnd} / ${placement.columnEnd}`;

/**
 * Build the user-visible grid reorder candidate set (PRD section 9.3 "Grid":
 * "DOM 순서 변경과 grid-area 변경 후보를 분리" — separate the DOM-order
 * change from the grid-area change candidates).
 *
 * Returns BOTH a `dom-order-reorder` and a `grid-area-placement` option so the
 * inspector can present the accessibility-sensitive choice. The caller (a
 * browser controller) feeds the user's selection to
 * {@link ./grid-intent.ts} `resolveGridIntent`, which enforces the "never
 * silently rewrite DOM order" guard.
 *
 * Malformed input (non-positive index, or a no-op drag where fromIndex ===
 * toIndex) populates `unsupported` and zeroes the candidate indices.
 */
export const buildGridReorderCandidates = (
  input: GridReorderCandidateInput,
): GridReorderCandidateSet => {
  const fromIndex = input.fromIndex;
  const toIndex = input.toIndex;

  if (fromIndex < 0 || toIndex < 0) {
    return {
      domOrder: { kind: "dom-order-reorder", fromIndex, toIndex },
      gridArea: {
        kind: "grid-area-placement",
        newGridArea: input.newGridArea ?? gridAreaString(input.target),
        a11ySafe: input.visualMatchesReadingOrder !== false,
      },
      unsupported: { message: "grid reorder indices must be non-negative" },
    };
  }

  if (fromIndex === toIndex) {
    return {
      domOrder: { kind: "dom-order-reorder", fromIndex, toIndex },
      gridArea: {
        kind: "grid-area-placement",
        newGridArea: input.newGridArea ?? gridAreaString(input.target),
        a11ySafe: input.visualMatchesReadingOrder !== false,
      },
      unsupported: { message: "grid reorder is a no-op (fromIndex === toIndex)" },
    };
  }

  const a11ySafe = input.visualMatchesReadingOrder !== false;
  const previousGridArea = input.previousGridArea ?? gridAreaString(input.source);
  const newGridArea = input.newGridArea ?? gridAreaString(input.target);

  return {
    domOrder: { kind: "dom-order-reorder", fromIndex, toIndex },
    gridArea: {
      kind: "grid-area-placement",
      ...(previousGridArea.length > 0 ? { previousGridArea } : {}),
      newGridArea,
      a11ySafe,
    },
    unsupported: null,
  };
};
