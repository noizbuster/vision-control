import { z } from "zod";

/**
 * Alignment / distribution command set (PRD section 9.7 / VC-0610).
 *
 * Ten user-facing commands that act on a multi-select group or a container's
 * children. This module owns only the command TAXONOMY and the axis/value
 * helpers; the semantic source-intent resolution lives in
 * {@link ./alignment-candidates.ts}.
 *
 * The commands are deliberately split into:
 *   - 6 snap-alignment commands (left/center/right × horizontal, top/middle/
 *     bottom × vertical),
 *   - 2 distribution commands (horizontal / vertical distribute),
 *   - 1 equal-gap command (equalize spacing between every member),
 *   - 1 match-size command (equalize a dimension, parameterized by
 *     {@link MatchAxis}).
 *
 * Per PRD constraint 2, a normal-flow alignment NEVER collapses to a pixel
 * transform. That guard lives in the candidate resolver; the command set is the
 * pure user-intent vocabulary.
 */

/**
 * The ten alignment/distribution command kinds.
 */
export const ALIGNMENT_COMMANDS = [
  "align-left",
  "align-center",
  "align-right",
  "align-top",
  "align-middle",
  "align-bottom",
  "distribute-horizontal",
  "distribute-vertical",
  "equal-gap",
  "match-size",
] as const;

export type AlignmentCommandKind = (typeof ALIGNMENT_COMMANDS)[number];

export const AlignmentCommandKindSchema = z.enum(ALIGNMENT_COMMANDS);

/** The six snap-alignment commands, grouped by screen axis. */
export const HORIZONTAL_ALIGNMENT_COMMANDS = ["align-left", "align-center", "align-right"] as const;

export const VERTICAL_ALIGNMENT_COMMANDS = ["align-top", "align-middle", "align-bottom"] as const;

/** Axis a match-size command equalizes. */
export const MATCH_AXES = ["width", "height"] as const;

export type MatchAxis = (typeof MATCH_AXES)[number];

export const MatchAxisSchema = z.enum(MATCH_AXES);

/** Screen axis an alignment/distribution command targets. */
export const ALIGNMENT_AXES = ["horizontal", "vertical"] as const;

export type AlignmentAxis = (typeof ALIGNMENT_AXES)[number];

/** Distribution spacing mode (mirrors change-ir `DistributeElementsOperation.mode`). */
export const DISTRIBUTION_MODES = ["space-between", "space-around", "equal-gap"] as const;

export type DistributionMode = (typeof DISTRIBUTION_MODES)[number];

const HORIZONTAL_SET: ReadonlySet<string> = new Set(HORIZONTAL_ALIGNMENT_COMMANDS);

/**
 * Screen axis a snap-alignment command targets. Distribution commands declare
 * their own axis in their kind; equal-gap and match-size are axis-agnostic
 * (match-size carries {@link MatchAxis}).
 */
export const commandAlignmentAxis = (kind: AlignmentCommandKind): AlignmentAxis => {
  switch (kind) {
    case "align-left":
    case "align-center":
    case "align-right":
      return "horizontal";
    case "align-top":
    case "align-middle":
    case "align-bottom":
      return "vertical";
    case "distribute-horizontal":
      return "horizontal";
    case "distribute-vertical":
      return "vertical";
    case "equal-gap":
    case "match-size":
      return "horizontal";
  }
};

/** True for the three horizontal snap-alignment commands. */
export const isHorizontalAlignment = (kind: AlignmentCommandKind): boolean =>
  HORIZONTAL_SET.has(kind);

/** True for the three vertical snap-alignment commands. */
export const isVerticalAlignment = (kind: AlignmentCommandKind): boolean =>
  kind === "align-top" || kind === "align-middle" || kind === "align-bottom";

/**
 * The flex box-alignment value a snap-alignment command maps to.
 *
 *   start edge  -> `flex-start`
 *   center      -> `center`
 *   end edge    -> `flex-end`
 *
 * Distribution commands reuse these values through `justify-content`/
 * `align-content` with a distribution mode.
 */
export const alignmentFlexValue = (
  kind: AlignmentCommandKind,
): "flex-start" | "center" | "flex-end" | null => {
  switch (kind) {
    case "align-left":
    case "align-top":
      return "flex-start";
    case "align-center":
    case "align-middle":
      return "center";
    case "align-right":
    case "align-bottom":
      return "flex-end";
    default:
      return null;
  }
};

/**
 * Human label for a command, used in inspector UI and journal summaries.
 */
export const commandLabel = (kind: AlignmentCommandKind): string => {
  switch (kind) {
    case "align-left":
      return "Align left";
    case "align-center":
      return "Align center (horizontal)";
    case "align-right":
      return "Align right";
    case "align-top":
      return "Align top";
    case "align-middle":
      return "Align middle (vertical)";
    case "align-bottom":
      return "Align bottom";
    case "distribute-horizontal":
      return "Distribute horizontally";
    case "distribute-vertical":
      return "Distribute vertically";
    case "equal-gap":
      return "Equalize gap";
    case "match-size":
      return "Match size";
  }
};
