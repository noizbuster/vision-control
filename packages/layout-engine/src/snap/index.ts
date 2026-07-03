/**
 * Snap System (PRD section 9.8 / VC-0617 snapping engine).
 *
 * Advisory, threshold-gated snap candidate computation. The engine proposes
 * candidates sorted by pointer distance; a caller applies a snap only when the
 * distance is below its own strict gate. No snap is ever forced.
 *
 * Owned by task VC-V1V2-24. This subdirectory is disjoint from the alignment
 * (task 7), auto-layout (task 8), and grid (task 9) subdirectories; it only
 * APPENDS to the package barrel (`export * from "./snap/index.js"`).
 *
 * All modules are pure and DOM-free (the package is `platform:isomorphic`).
 */

export {
  SNAP_AXES,
  SNAP_KINDS,
  type SnapAxis,
  SnapAxisSchema,
  type SnapCandidate,
  SnapCandidateSchema,
  type SnapKind,
  SnapKindSchema,
} from "./snap-candidate.js";
export {
  computeSnapCandidates,
  type SnapBox,
  type SnapConfig,
  type SnapGridLines,
  type SnapInput,
  type SnapSpacingToken,
} from "./snap-engine.js";
