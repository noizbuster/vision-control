import type { FlexDiagnostic, FlexRejected } from "./diagnostics.js";

export const WRITING_MODES = ["horizontal-tb", "vertical-rl", "vertical-lr"] as const;
export const FLEX_DIRECTIONS = ["row", "row-reverse", "column", "column-reverse"] as const;
export const DIRECTIONS = ["ltr", "rtl"] as const;
export const PHYSICAL_HANDLES = ["top", "right", "bottom", "left"] as const;

export type WritingMode = (typeof WRITING_MODES)[number];
export type FlexDirection = (typeof FLEX_DIRECTIONS)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type PhysicalHandle = (typeof PHYSICAL_HANDLES)[number];
export type PhysicalAxis = "x" | "y";
export type AxisSign = 1 | -1;
export type MainBoundary = "main-start" | "main-end";

export interface FlexAxisInput {
  readonly writingMode: WritingMode;
  readonly direction: Direction;
  readonly flexDirection: FlexDirection;
}

export interface PhysicalProgression {
  readonly axis: PhysicalAxis;
  readonly sign: AxisSign;
}

export interface FlexAxisResolution extends PhysicalProgression {
  readonly mainStartHandle: PhysicalHandle;
  readonly mainEndHandle: PhysicalHandle;
}

type LogicalProgressions = {
  readonly inline: PhysicalProgression;
  readonly block: PhysicalProgression;
};

export const LOGICAL_AXIS_ORACLE = {
  "horizontal-tb": {
    ltr: { inline: { axis: "x", sign: 1 }, block: { axis: "y", sign: 1 } },
    rtl: { inline: { axis: "x", sign: -1 }, block: { axis: "y", sign: 1 } },
  },
  "vertical-rl": {
    ltr: { inline: { axis: "y", sign: 1 }, block: { axis: "x", sign: -1 } },
    rtl: { inline: { axis: "y", sign: -1 }, block: { axis: "x", sign: -1 } },
  },
  "vertical-lr": {
    ltr: { inline: { axis: "y", sign: 1 }, block: { axis: "x", sign: 1 } },
    rtl: { inline: { axis: "y", sign: -1 }, block: { axis: "x", sign: 1 } },
  },
} as const satisfies Record<WritingMode, Record<Direction, LogicalProgressions>>;

const FLEX_DIRECTION_RULES = {
  row: { logicalAxis: "inline", multiplier: 1 },
  "row-reverse": { logicalAxis: "inline", multiplier: -1 },
  column: { logicalAxis: "block", multiplier: 1 },
  "column-reverse": { logicalAxis: "block", multiplier: -1 },
} as const satisfies Record<
  FlexDirection,
  { readonly logicalAxis: keyof LogicalProgressions; readonly multiplier: AxisSign }
>;

export const resolveFlexAxis = (input: FlexAxisInput): FlexAxisResolution => {
  const progressions = LOGICAL_AXIS_ORACLE[input.writingMode][input.direction];
  const rule = FLEX_DIRECTION_RULES[input.flexDirection];
  const base = progressions[rule.logicalAxis];
  const sign: AxisSign = rule.multiplier === 1 ? base.sign : base.sign === 1 ? -1 : 1;
  const [mainStartHandle, mainEndHandle]: readonly [PhysicalHandle, PhysicalHandle] =
    base.axis === "x"
      ? sign === 1
        ? ["left", "right"]
        : ["right", "left"]
      : sign === 1
        ? ["top", "bottom"]
        : ["bottom", "top"];
  return { axis: base.axis, sign, mainStartHandle, mainEndHandle };
};

export type PhysicalHandleResolution =
  | { readonly kind: "main-axis"; readonly boundary: MainBoundary }
  | { readonly kind: "cross-axis" };

export interface PhysicalHandleInput extends PhysicalProgression {
  readonly handle: PhysicalHandle;
}

export const resolvePhysicalFlexHandle = (input: PhysicalHandleInput): PhysicalHandleResolution => {
  const isMainHandle =
    input.axis === "x"
      ? input.handle === "left" || input.handle === "right"
      : input.handle === "top" || input.handle === "bottom";
  if (!isMainHandle) return { kind: "cross-axis" };
  const isNegativeSide = input.handle === "left" || input.handle === "top";
  const boundary: MainBoundary =
    (isNegativeSide && input.sign === 1) || (!isNegativeSide && input.sign === -1)
      ? "main-start"
      : "main-end";
  return { kind: "main-axis", boundary };
};

const malformed = (message: string): FlexRejected => ({
  ok: false,
  diagnostic: { code: "malformed_model", message },
});

const validChildCount = (childCount: number): boolean =>
  Number.isInteger(childCount) && childCount >= 0;

export type VisualDomOrderResult =
  | { readonly ok: true; readonly domIndices: readonly number[] }
  | FlexRejected;

export const visualDomOrder = (input: {
  readonly childCount: number;
  readonly sign: AxisSign;
}): VisualDomOrderResult => {
  if (!validChildCount(input.childCount))
    return malformed("childCount must be a non-negative integer");
  const domIndices = Array.from({ length: input.childCount }, (_, visualIndex) =>
    input.sign === 1 ? visualIndex : input.childCount - visualIndex - 1,
  );
  return { ok: true, domIndices };
};

export type VisualBoundaryMappingResult =
  | { readonly ok: true; readonly domIndex: number }
  | FlexRejected;

export const mapVisualBoundaryToDomIndex = (input: {
  readonly childCount: number;
  readonly visualBoundaryIndex: number;
  readonly sign: AxisSign;
}): VisualBoundaryMappingResult => {
  if (
    !validChildCount(input.childCount) ||
    !Number.isInteger(input.visualBoundaryIndex) ||
    input.visualBoundaryIndex < 0 ||
    input.visualBoundaryIndex > input.childCount
  ) {
    return malformed("visual boundary must be an integer within the child boundary range");
  }
  return {
    ok: true,
    domIndex:
      input.sign === 1 ? input.visualBoundaryIndex : input.childCount - input.visualBoundaryIndex,
  };
};

export type VisualNeighborResult =
  | {
      readonly ok: true;
      readonly primaryVisualIndex: number;
      readonly neighborVisualIndex: number;
      readonly neighborDomIndex: number;
    }
  | FlexRejected;

export const selectVisualBoundaryNeighbor = (input: {
  readonly childCount: number;
  readonly primaryDomIndex: number;
  readonly boundary: MainBoundary;
  readonly sign: AxisSign;
  readonly ambiguous: boolean;
}): VisualNeighborResult => {
  if (
    !validChildCount(input.childCount) ||
    !Number.isInteger(input.primaryDomIndex) ||
    input.primaryDomIndex < 0 ||
    input.primaryDomIndex >= input.childCount
  ) {
    return malformed("primaryDomIndex must identify a child in DOM order");
  }
  if (input.ambiguous) {
    const diagnostic: FlexDiagnostic = {
      code: "ambiguous_visual_neighbor",
      message: "visual geometry does not identify one adjacent flex item",
    };
    return { ok: false, diagnostic };
  }
  const primaryVisualIndex =
    input.sign === 1 ? input.primaryDomIndex : input.childCount - input.primaryDomIndex - 1;
  const neighborVisualIndex =
    input.boundary === "main-start" ? primaryVisualIndex - 1 : primaryVisualIndex + 1;
  if (neighborVisualIndex < 0 || neighborVisualIndex >= input.childCount) {
    return {
      ok: false,
      diagnostic: {
        code: "missing_visual_neighbor",
        message: `the ${input.boundary} boundary has no adjacent visual flex item`,
      },
    };
  }
  const neighborDomIndex =
    input.sign === 1 ? neighborVisualIndex : input.childCount - neighborVisualIndex - 1;
  return { ok: true, primaryVisualIndex, neighborVisualIndex, neighborDomIndex };
};
