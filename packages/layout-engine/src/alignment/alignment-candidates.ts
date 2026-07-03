import { isFlexContainerRole, isGridRole, type LayoutRole } from "../layout-role.js";
import {
  type AlignmentAxis,
  type AlignmentCommandKind,
  alignmentFlexValue,
  commandAlignmentAxis,
  type MatchAxis,
} from "./alignment-commands.js";

/**
 * The user's explicit opt-in for coordinate-based alignment inside a positioned
 * (absolute/fixed) context. Mirrors the {@link GroupFreeMoveIntent} rule from
 * group-move-candidates: a positioned-context alignment that writes coordinate
 * values to source is allowed ONLY when this flag is present.
 */
export type AlignmentFreeMoveIntent = "free-move";

/**
 * Parent CSS property that an alignment candidate may target. The two box-
 * alignment axes plus `gap` cover every normal-flow alignment/distribution
 * intent without ever resorting to a pixel transform.
 */
export type AlignmentParentProperty =
  | "justify-content"
  | "align-items"
  | "align-content"
  | "gap"
  | "display";

/**
 * Pure, DOM-free input to {@link resolveAlignmentCandidate}. The caller (a
 * browser controller) supplies the classified parent role and position flags;
 * this module never reads `getComputedStyle`.
 *
 * The constraint of PRD section 9.7 / constraint 2 is enforced here: a
 * normal-flow sibling alignment resolves to a parent layout property or a
 * child alignment intent, NEVER a pixel transform.
 */
export interface AlignmentInput {
  /** Layout role of the common parent (or the container whose children align). */
  readonly parentRole: LayoutRole;
  /**
   * The parent's CSS `flex-direction`. Needed to derive the main/cross axis for
   * a `flex-container` role (direction is not encoded in the role).
   */
  readonly parentFlexDirection?: string;
  /** The alignment/distribution command to resolve. */
  readonly command: AlignmentCommandKind;
  /** Number of selected members. Alignment/distribution needs at least 2. */
  readonly memberCount: number;
  /** For `match-size`: the dimension to equalize. */
  readonly matchAxis?: MatchAxis;
  /** For `equal-gap`: the caller-computed equal gap value (e.g. `"16px"`). */
  readonly computedGap?: string;
  /** Parent is out-of-flow (absolute/fixed). Enables coordinate intent (opt-in). */
  readonly contextPositioned?: boolean;
  /** Explicit user opt-in for a positioned-context coordinate alignment. */
  readonly userIntent?: AlignmentFreeMoveIntent;
}

/**
 * Semantic source-intent candidate for an alignment/distribution command.
 *
 * The `kind` values describe the SHAPE of the source intent, not change-ir
 * operations directly — the interaction machine / a builder maps a candidate
 * onto `align-elements` / `distribute-elements` / `style-edit` operations.
 *
 * - `parent-layout-property` — set a CSS box-alignment property on the parent
 *   (justify-content / align-items / align-content / gap). For a non-flex
 *   normal-flow parent, `requiresFlexConversion` signals that a `display: flex`
 *   change is the cleanest path (still a parent property, never a transform).
 * - `child-alignment-intent` — set a per-child property (align-self / flex).
 * - `positioned-coordinate-intent` — coordinate intent, allowed ONLY for a
 *   positioned context WITH explicit opt-in (Task 6 rule).
 * - `unsupported-normal-flow-pixel-transform` — DIAGNOSTIC. A normal-flow
 *   pixel-transform attempt is rejected (PRD constraint 2 / D41). The message
 *   NEVER instructs setting `position: absolute` or a `transform: translate`.
 * - `unsupported-alignment-grid` — grid alignment is task 9 scope.
 */
export type AlignmentCandidate =
  | {
      readonly kind: "parent-layout-property";
      readonly property: AlignmentParentProperty;
      readonly value: string;
      readonly requiresFlexConversion: boolean;
      readonly confidence: number;
      readonly rationale: string;
    }
  | {
      readonly kind: "child-alignment-intent";
      readonly property: "align-self" | "flex";
      readonly value: string;
      readonly confidence: number;
      readonly rationale: string;
    }
  | {
      readonly kind: "positioned-coordinate-intent";
      readonly axis: AlignmentAxis;
      readonly userIntent: "free-move";
      readonly confidence: number;
    }
  | {
      readonly kind: "unsupported-normal-flow-pixel-transform";
      readonly message: string;
    }
  | {
      readonly kind: "unsupported-alignment-grid";
      readonly message: string;
    };

const PIXEL_TRANSFORM_REJECT_MESSAGE =
  "alignment in normal flow resolves to a parent layout property or child alignment intent, not a pixel transform";

const POSITIONED_OPT_IN_MESSAGE =
  "positioned-context alignment needs explicit user intent (free-move opt-in) before writing coordinate values";

const TOO_FEW_MESSAGE = "alignment and distribution require at least two selected members";

/**
 * Resolve an alignment/distribution command to a semantic source-intent
 * candidate (PRD section 9.7 / constraint 2 / MVP D41).
 *
 * Decision order:
 *
 * 1. grid parent → `unsupported-alignment-grid` (task 9 scope).
 * 2. fewer than two members → `unsupported-normal-flow-pixel-transform`
 *    diagnostic (nothing to align).
 * 3. positioned (absolute/fixed) parent:
 *    - explicit `free-move` opt-in → `positioned-coordinate-intent` (allowed).
 *    - otherwise → rejected diagnostic (coordinate alignment needs opt-in).
 * 4. normal-flow flex parent → `parent-layout-property` (justify-content /
 *    align-items / align-content / gap) or `child-alignment-intent` (flex).
 * 5. normal-flow non-flex parent → `parent-layout-property` with
 *    `requiresFlexConversion: true` (cleanest semantic path, still a property).
 *
 * A normal-flow alignment NEVER returns a pixel-transform or coordinate
 * candidate. This is the structural enforcement of PRD constraint 2.
 */
export const resolveAlignmentCandidate = (input: AlignmentInput): AlignmentCandidate => {
  if (isGridRole(input.parentRole)) {
    return {
      kind: "unsupported-alignment-grid",
      message: "alignment in a grid context is not supported in V1 (see task 9)",
    };
  }

  if (input.memberCount < 2) {
    return { kind: "unsupported-normal-flow-pixel-transform", message: TOO_FEW_MESSAGE };
  }

  if (input.contextPositioned === true) {
    if (input.userIntent === "free-move") {
      return {
        kind: "positioned-coordinate-intent",
        axis: commandAlignmentAxis(input.command),
        userIntent: "free-move",
        confidence: 0.85,
      };
    }
    return { kind: "unsupported-normal-flow-pixel-transform", message: POSITIONED_OPT_IN_MESSAGE };
  }

  return resolveNormalFlowCandidate(input);
};

/**
 * Resolve a normal-flow candidate. Flex parents map directly to box-alignment
 * properties; non-flex normal-flow parents signal a flex conversion
 * (`requiresFlexConversion: true`). Never a coordinate intent.
 */
const resolveNormalFlowCandidate = (input: AlignmentInput): AlignmentCandidate => {
  const flex = isFlexContainerRole(input.parentRole);
  const requiresFlexConversion = !flex;

  switch (input.command) {
    case "align-left":
    case "align-center":
    case "align-right":
    case "align-top":
    case "align-middle":
    case "align-bottom":
      return snapAlignmentCandidate(input, requiresFlexConversion);

    case "distribute-horizontal":
    case "distribute-vertical":
      return distributionCandidate(input, requiresFlexConversion);

    case "equal-gap":
      return {
        kind: "parent-layout-property",
        property: "gap",
        value: input.computedGap ?? "auto",
        requiresFlexConversion,
        confidence: flex ? 0.9 : 0.75,
        rationale: flex
          ? "set parent `gap` to the equalized spacing"
          : "convert parent to flex, then set `gap` to the equalized spacing",
      };

    case "match-size":
      return matchSizeCandidate(input, requiresFlexConversion);
  }
};

/**
 * Snap-alignment (left/center/right/top/middle/bottom) candidate. For a flex
 * parent the command maps to justify-content (main axis) or align-items (cross
 * axis) depending on direction. A non-flex parent needs the conversion.
 */
const snapAlignmentCandidate = (
  input: AlignmentInput,
  requiresFlexConversion: boolean,
): AlignmentCandidate => {
  const value = alignmentFlexValue(input.command);
  if (value === null) {
    return {
      kind: "unsupported-normal-flow-pixel-transform",
      message: PIXEL_TRANSFORM_REJECT_MESSAGE,
    };
  }
  const property = flexPropertyForAxis(
    input.parentFlexDirection ?? "",
    commandAlignmentAxis(input.command),
  );
  return {
    kind: "parent-layout-property",
    property,
    value,
    requiresFlexConversion,
    confidence: requiresFlexConversion ? 0.8 : 0.92,
    rationale: requiresFlexConversion
      ? `convert parent to flex, then set ${property}: ${value}`
      : `set parent ${property}: ${value}`,
  };
};

/**
 * Distribution (horizontal/vertical distribute) candidate. The main axis maps
 * to justify-content; the cross axis maps to align-content (which requires the
 * parent to allow multiple lines, i.e. flex-wrap, or a flex conversion).
 */
const distributionCandidate = (
  input: AlignmentInput,
  requiresFlexConversion: boolean,
): AlignmentCandidate => {
  const axis = commandAlignmentAxis(input.command);
  const isMainAxis = axisIsMainAxis(input.parentFlexDirection ?? "", axis);
  const property: AlignmentParentProperty = isMainAxis ? "justify-content" : "align-content";
  return {
    kind: "parent-layout-property",
    property,
    value: "space-between",
    requiresFlexConversion,
    confidence: isMainAxis && !requiresFlexConversion ? 0.9 : 0.7,
    rationale: isMainAxis
      ? `set parent ${property}: space-between along the main axis`
      : `set parent ${property}: space-between (requires flex-wrap or flex conversion)`,
  };
};

/**
 * Match-size candidate. Equalizing the cross-axis dimension maps to
 * `align-items: stretch` (parent property); equalizing the main-axis dimension
 * maps to `flex: 1` on every child (child-alignment-intent).
 */
const matchSizeCandidate = (
  input: AlignmentInput,
  requiresFlexConversion: boolean,
): AlignmentCandidate => {
  const axis = matchAxisToScreenAxis(input.matchAxis ?? "width");
  const isMainAxis = axisIsMainAxis(input.parentFlexDirection ?? "", axis);
  if (isMainAxis) {
    return {
      kind: "child-alignment-intent",
      property: "flex",
      value: "1",
      confidence: 0.85,
      rationale: "set every child to flex: 1 for equal main-axis sizing",
    };
  }
  return {
    kind: "parent-layout-property",
    property: "align-items",
    value: "stretch",
    requiresFlexConversion,
    confidence: requiresFlexConversion ? 0.75 : 0.9,
    rationale: requiresFlexConversion
      ? "convert parent to flex, then set align-items: stretch"
      : "set parent align-items: stretch for equal cross-axis sizing",
  };
};

/**
 * Map a screen axis to the flexbox property that controls it for a given
 * parent direction. A row-direction flex container: horizontal -> justify-
 * content, vertical -> align-items. A column-direction container is the
 * inverse. Non-flex parents default to the row mapping (the conversion target).
 */
const flexPropertyForAxis = (
  parentFlexDirection: string,
  axis: AlignmentAxis,
): "justify-content" | "align-items" => {
  if (axisIsMainAxis(parentFlexDirection, axis)) {
    return "justify-content";
  }
  return "align-items";
};

/** True when `axis` is the main axis of the flex parent. */
const axisIsMainAxis = (flexDirection: string, axis: AlignmentAxis): boolean => {
  if (flexDirection.trim().toLowerCase().startsWith("column")) return axis === "vertical";
  return axis === "horizontal";
};

/** Map a match axis (width/height) to its screen axis. */
const matchAxisToScreenAxis = (matchAxis: MatchAxis): AlignmentAxis =>
  matchAxis === "width" ? "horizontal" : "vertical";
