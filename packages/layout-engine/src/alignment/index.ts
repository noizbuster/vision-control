/**
 * Alignment / distribution command set and semantic source-intent resolver
 * (PRD section 9.7 / VC-0610 / VC-0615 / VC-0616).
 *
 * Owned by task VC-V1V2-07. This subdirectory is disjoint from task 8
 * (auto-layout) and task 9 (grid); each task owns its layout-engine subdirectory
 * and only APPENDS to the package barrel.
 */

export {
  type AlignmentCandidate,
  type AlignmentFreeMoveIntent,
  type AlignmentInput,
  type AlignmentParentProperty,
  resolveAlignmentCandidate,
} from "./alignment-candidates.js";
export {
  ALIGNMENT_AXES,
  ALIGNMENT_COMMANDS,
  type AlignmentAxis,
  type AlignmentCommandKind,
  AlignmentCommandKindSchema,
  alignmentFlexValue,
  commandAlignmentAxis,
  commandLabel,
  DISTRIBUTION_MODES,
  type DistributionMode,
  HORIZONTAL_ALIGNMENT_COMMANDS,
  isHorizontalAlignment,
  isVerticalAlignment,
  MATCH_AXES,
  type MatchAxis,
  MatchAxisSchema,
  VERTICAL_ALIGNMENT_COMMANDS,
} from "./alignment-commands.js";
