/**
 * V1 CSS Grid support (PRD section 9.3 "Grid" / 9.5 grid span / open question 9).
 *
 * This subdirectory is disjoint from the parallel alignment (task 7) and
 * auto-layout (task 8) work, which create their own subdirectories. The MVP
 * `unsupported-grid` diagnostic in `../semantic-operations.ts` forwards here:
 * a grid context now resolves through cell inference → user-visible choice
 * (DOM order vs grid-area placement) → semantic source intent, with the
 * accessibility guard that a visual grid placement never silently rewrites DOM
 * order.
 *
 * All modules are pure and DOM-free (the package is `platform:isomorphic`).
 */

export {
  type GridCellPlacement,
  type GridChildPlacementInput,
  type GridTrackInfo,
  inferGridCells,
} from "./grid-cell-inference.js";
export {
  GRID_AWARE_FLOW_POINTER,
  type GridIntentInput,
  type GridIntentResolution,
  type GridUserChoice,
  resolveGridIntent,
} from "./grid-intent.js";
export {
  buildGridReorderCandidates,
  type DomOrderReorderCandidate,
  type GridAreaPlacementCandidate,
  type GridReorderCandidateInput,
  type GridReorderCandidateSet,
} from "./grid-reorder-candidates.js";
export {
  type GridSpanAxis,
  type GridSpanCandidate,
  generateGridSpanCandidates,
} from "./grid-span-candidates.js";
