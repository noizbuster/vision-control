import type { ElementRef } from "@vision-control/element-identity";

import type { GridCellPlacement, GridTrackInfo } from "./grid/grid-cell-inference.js";
import {
  type GridSpanAxis,
  type GridSpanCandidate,
  generateGridSpanCandidates,
} from "./grid/grid-span-candidates.js";
import { classifyLayoutRole, type LayoutComputedStyle, type LayoutRole } from "./layout-role.js";

/**
 * CSS dimension properties a resize gesture may target (PRD section 9.5). Aligned
 * with `@vision-control/change-ir`'s `RESIZE_PROPERTIES` so a `css-property`
 * candidate maps directly onto a `resize-element` operation. `align-self` covers
 * the flex cross-axis `stretch` candidate.
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
  | "aspect-ratio"
  | "align-self";

/**
 * Discriminator for the 12 PRD section 9.5 resize candidate kinds.
 *
 * - `css-property` covers the 8 property-shaped kinds: width/height, min/max-*,
 *   flex-basis/grow, `align-self: stretch`, `aspect-ratio`.
 * - `grid-span` covers `grid-column` / `grid-row` span (bridges
 *   {@link generateGridSpanCandidates}).
 * - `intrinsic` covers image / replaced-element intrinsic sizing.
 * - `tailwind-class` covers a Tailwind sizing utility class.
 * - `design-token` covers a design-token-backed sizing reference.
 */
export type ResizeCandidateKind =
  | "css-property"
  | "grid-span"
  | "intrinsic"
  | "tailwind-class"
  | "design-token";

export interface ResizeCssPropertyCandidate {
  readonly kind: "css-property";
  readonly property: ResizePropertyKind;
  readonly rationale: string;
}

export interface ResizeGridSpanCandidate {
  readonly kind: "grid-span";
  readonly axis: GridSpanAxis;
  readonly fromSpan: number;
  readonly toSpan: number;
  readonly rationale: string;
}

export interface ResizeIntrinsicCandidate {
  readonly kind: "intrinsic";
  readonly rationale: string;
}

export interface ResizeTailwindClassCandidate {
  readonly kind: "tailwind-class";
  readonly rationale: string;
}

export interface ResizeDesignTokenCandidate {
  readonly kind: "design-token";
  readonly rationale: string;
}

export type ResizeCandidate =
  | ResizeCssPropertyCandidate
  | ResizeGridSpanCandidate
  | ResizeIntrinsicCandidate
  | ResizeTailwindClassCandidate
  | ResizeDesignTokenCandidate;

export type ResizeUnsupportedDiagnostic = "inline-unsupported" | "unknown-unsupported";

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

/**
 * Grid placement + track geometry a grid-item resize needs to synthesize span
 * candidates. Supplied by the browser inspector (the grid cell inference reads
 * `getComputedStyle`); this package is DOM-free.
 */
export interface GridResizeContext {
  readonly placement: GridCellPlacement;
  readonly tracks: GridTrackInfo;
}

const css = (property: ResizePropertyKind, rationale: string): ResizeCssPropertyCandidate => ({
  kind: "css-property",
  property,
  rationale,
});

const FLEX_ITEM_CANDIDATES: readonly ResizeCandidate[] = [
  css("flex-basis", "flex item main-size; resizing it does not break flex layout"),
  css("flex-grow", "flex grow factor; redistributes free space along the main axis"),
  css("flex-shrink", "flex shrink factor; controls compression under overflow"),
  css("min-width", "lower bound protecting the flex basis"),
  css("min-height", "lower bound on the cross axis"),
  css("max-width", "upper bound on the flex basis"),
  css("max-height", "upper bound on the cross axis"),
  css("aspect-ratio", "couples width and height for proportional resize"),
];

const ALIGN_SELF_STRETCH_CANDIDATE: ResizeCssPropertyCandidate = css(
  "align-self",
  "flex cross-axis stretch; align-self: stretch fills the container cross axis",
);

const BOX_CANDIDATES: readonly ResizeCandidate[] = [
  css("width", "block box width"),
  css("height", "block box height"),
  css("min-width", "lower bound on width"),
  css("max-width", "upper bound on width"),
  css("min-height", "lower bound on height"),
  css("max-height", "upper bound on height"),
  css("aspect-ratio", "couples width and height for proportional resize"),
];

const INTRINSIC_CANDIDATE: ResizeIntrinsicCandidate = {
  kind: "intrinsic",
  rationale: "replaced element intrinsic sizing; respect the natural aspect ratio and dimensions",
};

const TAILWIND_CLASS_CANDIDATE: ResizeTailwindClassCandidate = {
  kind: "tailwind-class",
  rationale: "Tailwind sizing utility (w-*/h-*/basis-*); resolved by the tailwind adapter",
};

const DESIGN_TOKEN_CANDIDATE: ResizeDesignTokenCandidate = {
  kind: "design-token",
  rationale: "design token reference; resolve to the matching spacing/sizing token",
};

const toGridSpanCandidate = (c: GridSpanCandidate): ResizeGridSpanCandidate => ({
  kind: "grid-span",
  axis: c.axis,
  fromSpan: c.fromSpan,
  toSpan: c.toSpan,
  rationale: c.rationale,
});

/**
 * Generate resize candidate operations for `target` given its layout role and
 * computed style (PRD section 9.5 — all 12 candidate kinds).
 *
 * - `flex-item` → `flex-basis` / `flex-grow` / `align-self: stretch` (cross
 *   axis) plus tailwind-class / design-token alternatives.
 * - `grid-item` → `grid-column` / `grid-row` span candidates (from
 *   {@link generateGridSpanCandidates}); requires `gridContext`.
 * - `grid-container` / `flex-container` / `normal-flow-block` /
 *   `absolute-positioned` / `fixed-positioned` / `svg-element` → `width` /
 *   `height` box candidates plus tailwind-class / design-token alternatives.
 * - `replaced-element` → intrinsic sizing candidate plus box candidates.
 * - `inline` / `inline-block` → unsupported (no independently resizable box).
 * - `unknown` → unsupported (do not emit candidates for an unclassifiable box).
 *
 * `target` is echoed in the result so a caller batching many elements can
 * correlate each candidate set to its element.
 */
export const generateResizeCandidates = (
  target: ElementRef,
  layoutRole: LayoutRole,
  gridContext?: GridResizeContext,
): ResizeCandidateSet => {
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

  if (layoutRole === "grid-item") {
    const spanCandidates = gridContext
      ? generateGridSpanCandidates(gridContext.placement, gridContext.tracks).map(
          toGridSpanCandidate,
        )
      : [];
    return { supported: true, target, candidates: spanCandidates };
  }

  if (layoutRole === "flex-item") {
    return {
      supported: true,
      target,
      candidates: [
        ...FLEX_ITEM_CANDIDATES,
        ALIGN_SELF_STRETCH_CANDIDATE,
        TAILWIND_CLASS_CANDIDATE,
        DESIGN_TOKEN_CANDIDATE,
      ],
    };
  }

  if (layoutRole === "replaced-element") {
    return {
      supported: true,
      target,
      candidates: [
        INTRINSIC_CANDIDATE,
        ...BOX_CANDIDATES,
        TAILWIND_CLASS_CANDIDATE,
        DESIGN_TOKEN_CANDIDATE,
      ],
    };
  }

  return {
    supported: true,
    target,
    candidates: [...BOX_CANDIDATES, TAILWIND_CLASS_CANDIDATE, DESIGN_TOKEN_CANDIDATE],
  };
};

/**
 * Convenience wrapper: classify then generate. Useful when the caller has only
 * the raw computed style and wants the candidate set in one call. Pass
 * `gridContext` for grid-item span candidates.
 */
export const classifyAndGenerateResizeCandidates = (
  target: ElementRef,
  computedStyle: LayoutComputedStyle,
  gridContext?: GridResizeContext,
): ResizeCandidateSet =>
  generateResizeCandidates(target, classifyLayoutRole(computedStyle), gridContext);
