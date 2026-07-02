import type { ElementRef } from "@vision-control/element-identity";

import { classifyLayoutRole, type LayoutComputedStyle, type LayoutRole } from "./layout-role.js";

/**
 * CSS dimension properties a resize gesture may target (PRD section 9.5). Aligned
 * with `@vision-control/change-ir`'s `RESIZE_PROPERTIES` so a resize candidate
 * maps directly onto a `resize-element` operation.
 */
export type ResizePropertyKind =
  | "width"
  | "height"
  | "flex-basis"
  | "flex-grow"
  | "flex-shrink"
  | "min-width"
  | "max-width"
  | "min-height"
  | "max-height"
  | "aspect-ratio";

export interface ResizeCandidate {
  readonly property: ResizePropertyKind;
  readonly rationale: string;
}

export type ResizeUnsupportedDiagnostic =
  | "grid-unsupported"
  | "inline-unsupported"
  | "unknown-unsupported";

export type ResizeCandidateSet =
  | {
      readonly supported: true;
      readonly target: ElementRef;
      readonly candidates: readonly ResizeCandidate[];
    }
  | {
      readonly supported: false;
      readonly target: ElementRef;
      readonly diagnostic: ResizeUnsupportedDiagnostic;
      readonly message: string;
    };

const FLEX_ITEM_CANDIDATES: readonly ResizeCandidate[] = [
  {
    property: "flex-basis",
    rationale: "flex item main-size; resizing it does not break flex layout",
  },
  {
    property: "flex-grow",
    rationale: "flex grow factor; redistributes free space along the main axis",
  },
  { property: "flex-shrink", rationale: "flex shrink factor; controls compression under overflow" },
  { property: "min-width", rationale: "lower bound protecting the flex basis" },
  { property: "min-height", rationale: "lower bound on the cross axis" },
  { property: "max-width", rationale: "upper bound on the flex basis" },
  { property: "max-height", rationale: "upper bound on the cross axis" },
  { property: "aspect-ratio", rationale: "couples width and height for proportional resize" },
];

const BOX_CANDIDATES: readonly ResizeCandidate[] = [
  { property: "width", rationale: "block box width" },
  { property: "height", rationale: "block box height" },
  { property: "min-width", rationale: "lower bound on width" },
  { property: "max-width", rationale: "upper bound on width" },
  { property: "min-height", rationale: "lower bound on height" },
  { property: "max-height", rationale: "upper bound on height" },
  { property: "aspect-ratio", rationale: "couples width and height for proportional resize" },
];

const isFlexItem = (computedStyle: LayoutComputedStyle): boolean => {
  const parent = computedStyle.parentDisplay;
  return parent !== undefined && parent.trim().toLowerCase() === "flex";
};

/**
 * Generate resize candidate operations for `target` given its layout role and
 * computed style (PRD section 9.5).
 *
 * - flex items → `flex-basis` / `flex-grow` (never `width`/`height`, which would
 *   be overridden by the flex algorithm and break the layout).
 * - block / absolute / fixed / sticky / table-cell → `width` / `height`.
 * - grid → unsupported (grid span editing is out of MVP scope).
 * - inline / inline-block → unsupported (no independently resizable box).
 * - unknown → unsupported (do not emit candidates for an unclassifiable box).
 *
 * `target` is echoed in the result so a caller batching many elements can
 * correlate each candidate set to its element.
 */
export const generateResizeCandidates = (
  target: ElementRef,
  layoutRole: LayoutRole,
  computedStyle: LayoutComputedStyle,
): ResizeCandidateSet => {
  if (layoutRole === "grid") {
    return {
      supported: false,
      target,
      diagnostic: "grid-unsupported",
      message: "grid span editing is not supported in the MVP",
    };
  }
  if (layoutRole === "inline" || layoutRole === "inline-block") {
    return {
      supported: false,
      target,
      diagnostic: "inline-unsupported",
      message: "inline elements do not expose an independently resizable box",
    };
  }
  if (layoutRole === "unknown") {
    return {
      supported: false,
      target,
      diagnostic: "unknown-unsupported",
      message: "layout role could not be classified; no resize candidates generated",
    };
  }

  // A block child of a flex container is a flex item: prefer flex properties.
  if (isFlexItem(computedStyle)) {
    return { supported: true, target, candidates: FLEX_ITEM_CANDIDATES };
  }

  return { supported: true, target, candidates: BOX_CANDIDATES };
};

/**
 * Convenience wrapper: classify then generate. Useful when the caller has only
 * the raw computed style and wants the candidate set in one call.
 */
export const classifyAndGenerateResizeCandidates = (
  target: ElementRef,
  computedStyle: LayoutComputedStyle,
): ResizeCandidateSet =>
  generateResizeCandidates(target, classifyLayoutRole(computedStyle), computedStyle);
