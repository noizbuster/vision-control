import type { ElementRef } from "@vision-control/element-identity";
import type { Point, Rect } from "@vision-control/geometry";

import {
  type AxisSign,
  type FlexAxisInput,
  type PhysicalAxis,
  resolveBlockAxis,
  resolveFlexAxis,
  resolveFlexCrossAxis,
  type WritingMode,
} from "./logical-axis.js";

export type FlexWrapMode = "nowrap" | "wrap" | "wrap-reverse";

export interface MoveItemBox {
  readonly rect: Rect;
  readonly margins: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /** Target child DOM index after removing the moving element, when applicable. */
  readonly domIndex: number;
  readonly order: number;
  readonly inFlow: boolean;
}

export interface MoveInsertionInput {
  readonly parent: ElementRef;
  readonly parentRect: Rect;
  readonly childCount: number;
  readonly items: readonly MoveItemBox[];
  readonly movingOrder: number;
  readonly sourceIndex: number | null;
  readonly pointer: Point;
  readonly flow:
    | { readonly kind: "block"; readonly writingMode: WritingMode }
    | {
        readonly kind: "flex";
        readonly axis: FlexAxisInput;
        readonly wrap: FlexWrapMode;
      };
}

export interface MoveInsertionIndicator {
  readonly axis: PhysicalAxis;
  readonly position: number;
  readonly spanStart: number;
  readonly spanSize: number;
}

export interface MoveVisualBoundary {
  readonly beforeDomIndex: number | null;
  readonly afterDomIndex: number | null;
}

export type MoveInsertionDiagnosticCode =
  | "invalid-geometry"
  | "ambiguous-flex-lines"
  | "css-order-unrepresentable";

export type MoveInsertionResolution =
  | {
      readonly ok: true;
      readonly index: number;
      readonly indicator: MoveInsertionIndicator;
      readonly visualBoundary: MoveVisualBoundary;
    }
  | {
      readonly ok: false;
      readonly diagnostic: {
        readonly code: MoveInsertionDiagnosticCode;
        readonly message: string;
      };
    };

type MoveInsertionFailure = Extract<MoveInsertionResolution, { readonly ok: false }>;

type ProgressionInterval = {
  readonly leading: number;
  readonly trailing: number;
};

type VisibleItem = {
  readonly item: MoveItemBox;
  readonly main: ProgressionInterval;
  readonly cross: ProgressionInterval;
  readonly borderMain: ProgressionInterval;
  readonly borderCrossStart: number;
  readonly borderCrossEnd: number;
};

type FlexLine = {
  readonly items: readonly VisibleItem[];
  readonly cross: ProgressionInterval;
  readonly borderCrossStart: number;
  readonly borderCrossEnd: number;
};

const GEOMETRY_TOLERANCE = 0.5;

const failure = (code: MoveInsertionDiagnosticCode, message: string): MoveInsertionFailure => ({
  ok: false,
  diagnostic: { code, message },
});

const finite = (value: number): boolean => Number.isFinite(value);

const validRect = (rect: Rect, requirePositive: boolean): boolean =>
  finite(rect.x) &&
  finite(rect.y) &&
  finite(rect.width) &&
  finite(rect.height) &&
  rect.width >= 0 &&
  rect.height >= 0 &&
  (!requirePositive || (rect.width > 0 && rect.height > 0));

const positiveRect = (rect: Rect): boolean => rect.width > 0 && rect.height > 0;

const rectStart = (rect: Rect, axis: PhysicalAxis): number => (axis === "x" ? rect.x : rect.y);

const rectEnd = (rect: Rect, axis: PhysicalAxis): number =>
  axis === "x" ? rect.x + rect.width : rect.y + rect.height;

const signedInterval = (start: number, end: number, sign: AxisSign): ProgressionInterval =>
  sign === 1 ? { leading: start, trailing: end } : { leading: -end, trailing: -start };

const physicalCoordinate = (coordinate: number, sign: AxisSign): number => coordinate * sign;

const pointerOn = (point: Point, axis: PhysicalAxis): number => (axis === "x" ? point.x : point.y);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const spanForParent = (
  parentRect: Rect,
  axis: PhysicalAxis,
): Pick<MoveInsertionIndicator, "spanStart" | "spanSize"> =>
  axis === "x"
    ? { spanStart: parentRect.y, spanSize: parentRect.height }
    : { spanStart: parentRect.x, spanSize: parentRect.width };

const parentAxisBounds = (parentRect: Rect, axis: PhysicalAxis): readonly [number, number] =>
  axis === "x"
    ? [parentRect.x, parentRect.x + parentRect.width]
    : [parentRect.y, parentRect.y + parentRect.height];

const validateInput = (input: MoveInsertionInput): MoveInsertionResolution | null => {
  if (
    !finite(input.pointer.x) ||
    !finite(input.pointer.y) ||
    !validRect(input.parentRect, true) ||
    !Number.isInteger(input.childCount) ||
    input.childCount < 0 ||
    input.items.length !== input.childCount ||
    !Number.isInteger(input.movingOrder) ||
    !finite(input.movingOrder) ||
    (input.sourceIndex !== null &&
      (!Number.isInteger(input.sourceIndex) ||
        input.sourceIndex < 0 ||
        input.sourceIndex > input.childCount))
  ) {
    return failure(
      "invalid-geometry",
      "Move insertion input has invalid geometry or child indices.",
    );
  }

  const domIndices = new Set<number>();
  for (const item of input.items) {
    if (
      !validRect(item.rect, false) ||
      !Number.isInteger(item.domIndex) ||
      item.domIndex < 0 ||
      item.domIndex >= input.childCount ||
      domIndices.has(item.domIndex) ||
      !Number.isInteger(item.order) ||
      !finite(item.order)
    ) {
      return failure("invalid-geometry", "Move item geometry or ordering is invalid.");
    }
    domIndices.add(item.domIndex);

    if (
      item.inFlow &&
      (!finite(item.margins.top) ||
        !finite(item.margins.right) ||
        !finite(item.margins.bottom) ||
        !finite(item.margins.left) ||
        item.margins.top < 0 ||
        item.margins.right < 0 ||
        item.margins.bottom < 0 ||
        item.margins.left < 0)
    ) {
      return failure("invalid-geometry", "In-flow item margins must be finite and non-negative.");
    }
  }
  return null;
};

const visibleItems = (
  input: MoveInsertionInput,
  mainAxis: PhysicalAxis,
  mainSign: AxisSign,
  crossAxis: PhysicalAxis,
  crossSign: AxisSign,
): readonly VisibleItem[] =>
  input.items
    .filter((item) => item.inFlow && positiveRect(item.rect))
    .slice()
    .sort((a, b) => a.order - b.order || a.domIndex - b.domIndex)
    .map((item) => {
      const outerLeft = item.rect.x - item.margins.left;
      const outerRight = item.rect.x + item.rect.width + item.margins.right;
      const outerTop = item.rect.y - item.margins.top;
      const outerBottom = item.rect.y + item.rect.height + item.margins.bottom;
      const outerMain =
        mainAxis === "x"
          ? signedInterval(outerLeft, outerRight, mainSign)
          : signedInterval(outerTop, outerBottom, mainSign);
      const outerCross =
        crossAxis === "x"
          ? signedInterval(outerLeft, outerRight, crossSign)
          : signedInterval(outerTop, outerBottom, crossSign);
      const borderMain = signedInterval(
        rectStart(item.rect, mainAxis),
        rectEnd(item.rect, mainAxis),
        mainSign,
      );
      return {
        item,
        main: outerMain,
        cross: outerCross,
        borderMain,
        borderCrossStart: rectStart(item.rect, crossAxis),
        borderCrossEnd: rectEnd(item.rect, crossAxis),
      };
    });

const makeLines = (
  items: readonly VisibleItem[],
  wrap: FlexWrapMode,
): readonly FlexLine[] | MoveInsertionFailure => {
  const firstItem = items[0];
  if (firstItem === undefined) return [];

  const groups: VisibleItem[][] = [[firstItem]];
  for (let index = 1; index < items.length; index += 1) {
    const item = items[index];
    const current = groups[groups.length - 1];
    if (item === undefined || current === undefined) continue;
    const previous = current[current.length - 1];
    if (previous === undefined) continue;

    const reset = item.main.leading <= previous.main.leading + GEOMETRY_TOLERANCE;
    if (wrap !== "nowrap" && reset) {
      groups.push([item]);
      continue;
    }
    if (
      item.main.leading < previous.main.leading - GEOMETRY_TOLERANCE ||
      item.main.leading < previous.main.trailing - GEOMETRY_TOLERANCE
    ) {
      return failure(
        "ambiguous-flex-lines",
        "Flex item outer boxes overlap or reverse on the main axis.",
      );
    }
    current.push(item);
  }

  const lines: FlexLine[] = [];
  for (const group of groups) {
    const first = group[0];
    if (first === undefined) continue;
    let crossLeading = first.cross.leading;
    let crossTrailing = first.cross.trailing;
    let borderCrossStart = first.borderCrossStart;
    let borderCrossEnd = first.borderCrossEnd;
    for (const item of group.slice(1)) {
      crossLeading = Math.min(crossLeading, item.cross.leading);
      crossTrailing = Math.max(crossTrailing, item.cross.trailing);
      borderCrossStart = Math.min(borderCrossStart, item.borderCrossStart);
      borderCrossEnd = Math.max(borderCrossEnd, item.borderCrossEnd);
    }
    lines.push({
      items: group,
      cross: { leading: crossLeading, trailing: crossTrailing },
      borderCrossStart,
      borderCrossEnd,
    });
  }

  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const line = lines[index];
    if (
      previous === undefined ||
      line === undefined ||
      line.cross.leading < previous.cross.leading - GEOMETRY_TOLERANCE ||
      line.cross.leading < previous.cross.trailing - GEOMETRY_TOLERANCE
    ) {
      return failure(
        "ambiguous-flex-lines",
        "Flex line outer boxes overlap or reverse on the cross axis.",
      );
    }
  }

  return lines;
};

const isLineFailure = (
  value: readonly FlexLine[] | MoveInsertionFailure,
): value is MoveInsertionFailure => !Array.isArray(value);

const chooseLine = (lines: readonly FlexLine[], crossPointer: number): FlexLine => {
  let selected = lines[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const lineDistance =
      crossPointer < line.cross.leading
        ? line.cross.leading - crossPointer
        : crossPointer > line.cross.trailing
          ? crossPointer - line.cross.trailing
          : 0;
    if (lineDistance < distance) {
      selected = line;
      distance = lineDistance;
    }
  }
  return selected as FlexLine;
};

const visualBoundary = (items: readonly VisibleItem[], index: number): MoveVisualBoundary => ({
  beforeDomIndex: items[index - 1]?.item.domIndex ?? null,
  afterDomIndex: items[index]?.item.domIndex ?? null,
});

const emptyResolution = (
  input: MoveInsertionInput,
  axis: PhysicalAxis,
): MoveInsertionResolution => {
  const [start, end] = parentAxisBounds(input.parentRect, axis);
  return {
    ok: true,
    index: input.childCount,
    indicator: {
      axis,
      position: clamp(pointerOn(input.pointer, axis), start, end),
      ...spanForParent(input.parentRect, axis),
    },
    visualBoundary: { beforeDomIndex: null, afterDomIndex: null },
  };
};

const blockResolution = (input: MoveInsertionInput): MoveInsertionResolution => {
  if (input.flow.kind !== "block") {
    return failure("invalid-geometry", "Block insertion requires a block flow.");
  }
  const progression = resolveBlockAxis(input.flow.writingMode);
  const visible = input.items
    .filter((item) => item.inFlow && positiveRect(item.rect))
    .slice()
    .sort((a, b) => a.domIndex - b.domIndex)
    .map((item) => ({
      item,
      interval: signedInterval(
        rectStart(item.rect, progression.axis),
        rectEnd(item.rect, progression.axis),
        progression.sign,
      ),
    }));

  if (visible.length === 0) return emptyResolution(input, progression.axis);

  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1];
    const item = visible[index];
    if (
      previous === undefined ||
      item === undefined ||
      item.interval.leading < previous.interval.leading - GEOMETRY_TOLERANCE ||
      item.interval.leading < previous.interval.trailing - GEOMETRY_TOLERANCE
    ) {
      return failure("invalid-geometry", "Block child boxes overlap or reverse in DOM order.");
    }
  }

  const signedPointer = pointerOn(input.pointer, progression.axis) * progression.sign;
  let boundary = 0;
  while (boundary < visible.length) {
    const item = visible[boundary];
    if (item === undefined || signedPointer <= (item.interval.leading + item.interval.trailing) / 2)
      break;
    boundary += 1;
  }

  const previous = visible[boundary - 1];
  const next = visible[boundary];
  const position =
    boundary === 0
      ? physicalCoordinate(next?.interval.leading ?? signedPointer, progression.sign)
      : boundary === visible.length
        ? physicalCoordinate(previous?.interval.trailing ?? signedPointer, progression.sign)
        : physicalCoordinate(
            ((previous?.interval.trailing ?? signedPointer) +
              (next?.interval.leading ?? signedPointer)) /
              2,
            progression.sign,
          );
  const index =
    boundary === 0
      ? 0
      : boundary === visible.length
        ? input.childCount
        : (next?.item.domIndex ?? input.childCount);

  return {
    ok: true,
    index,
    indicator: {
      axis: progression.axis,
      position,
      ...spanForParent(input.parentRect, progression.axis),
    },
    visualBoundary: {
      beforeDomIndex: previous?.item.domIndex ?? null,
      afterDomIndex: next?.item.domIndex ?? null,
    },
  };
};

const flexIndex = (
  input: MoveInsertionInput,
  visible: readonly VisibleItem[],
  visualIndex: number,
): number | MoveInsertionResolution => {
  const lowerOrderCount = visible.filter((item) => item.item.order < input.movingOrder).length;
  const sameOrder = visible.filter((item) => item.item.order === input.movingOrder);
  if (visualIndex < lowerOrderCount || visualIndex > lowerOrderCount + sameOrder.length) {
    return failure(
      "css-order-unrepresentable",
      "The selected visual boundary cannot be represented by a DOM-only move.",
    );
  }

  const sameOrderBefore = visualIndex - lowerOrderCount;
  const nextVisualSibling = visible[visualIndex];
  const preferred = input.sourceIndex ?? nextVisualSibling?.item.domIndex ?? input.childCount;
  const first = sameOrder[0];
  const last = sameOrder[sameOrder.length - 1];
  const previous = sameOrder[sameOrderBefore - 1];
  const next = sameOrder[sameOrderBefore];
  const minIndex = sameOrderBefore === 0 ? 0 : (previous?.item.domIndex ?? input.childCount) + 1;
  const maxIndex =
    sameOrderBefore === sameOrder.length ? input.childCount : (next?.item.domIndex ?? 0);

  if (sameOrder.length === 0 || first === undefined || last === undefined) return input.childCount;
  return clamp(preferred, minIndex, maxIndex);
};

const flexResolution = (input: MoveInsertionInput): MoveInsertionResolution => {
  if (input.flow.kind !== "flex") return blockResolution(input);

  const main = resolveFlexAxis(input.flow.axis);
  const cross = resolveFlexCrossAxis(input.flow.axis, input.flow.wrap);
  const visible = visibleItems(input, main.axis, main.sign, cross.axis, cross.sign);
  if (visible.length === 0) return emptyResolution(input, main.axis);

  const lines = makeLines(visible, input.flow.wrap);
  if (isLineFailure(lines)) return lines;
  const line = chooseLine(lines, pointerOn(input.pointer, cross.axis) * cross.sign);
  const precedingCount = lines
    .slice(0, lines.indexOf(line))
    .reduce((count, current) => count + current.items.length, 0);
  const signedPointer = pointerOn(input.pointer, main.axis) * main.sign;
  let localBoundary = 0;
  while (localBoundary < line.items.length) {
    const item = line.items[localBoundary];
    if (
      item === undefined ||
      signedPointer <= (item.borderMain.leading + item.borderMain.trailing) / 2
    )
      break;
    localBoundary += 1;
  }

  const visualIndex = precedingCount + localBoundary;
  const index = flexIndex(input, visible, visualIndex);
  if (typeof index !== "number") return index;

  const previous = line.items[localBoundary - 1];
  const next = line.items[localBoundary];
  const position =
    localBoundary === 0
      ? physicalCoordinate(next?.borderMain.leading ?? signedPointer, main.sign)
      : localBoundary === line.items.length
        ? physicalCoordinate(previous?.borderMain.trailing ?? signedPointer, main.sign)
        : physicalCoordinate(
            ((previous?.borderMain.trailing ?? signedPointer) +
              (next?.borderMain.leading ?? signedPointer)) /
              2,
            main.sign,
          );

  return {
    ok: true,
    index,
    indicator: {
      axis: main.axis,
      position,
      spanStart: line.borderCrossStart,
      spanSize: line.borderCrossEnd - line.borderCrossStart,
    },
    visualBoundary: visualBoundary(visible, visualIndex),
  };
};

/**
 * Resolves a pointer Move insertion without reading browser DOM state. It fails
 * closed whenever browser geometry cannot prove one ordered block or flex line.
 */
export const computeMoveInsertion = (input: MoveInsertionInput): MoveInsertionResolution => {
  const invalid = validateInput(input);
  if (invalid !== null) return invalid;
  return input.flow.kind === "block" ? blockResolution(input) : flexResolution(input);
};
