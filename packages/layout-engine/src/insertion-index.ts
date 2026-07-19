import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import {
  type FlexAxisInput,
  mapVisualBoundaryToDomIndex,
  resolveFlexAxis,
  visualDomOrder,
} from "./flex/logical-axis.js";
import type { LayoutRole } from "./layout-role.js";

/**
 * A child's bounding rect used for insertion-index computation. Callers supply
 * one per in-flow child of the drop target, in DOM order.
 */
export interface ChildBox {
  readonly rect: Rect;
}

/**
 * Where the drop indicator (insertion line) should be drawn. `axis` is the flow
 * axis of the container; `position` is the pixel offset along that axis at which
 * the indicator line sits (a boundary between two children, or the leading /
 * trailing edge at the ends).
 */
export interface InsertionIndicator {
  readonly axis: "x" | "y";
  readonly position: number;
}

export interface InsertionResult {
  /** The containing element the index is relative to. */
  readonly parent: ElementRef;
  /** Insertion position in DOM order, `0..children.length`. */
  readonly index: number;
  readonly indicator: InsertionIndicator;
}

export type InsertionFlow =
  | { readonly kind: "block" }
  | { readonly kind: "flex"; readonly axis: FlexAxisInput };

export interface LogicalInsertionInput {
  readonly parent: ElementRef;
  readonly children: readonly ChildBox[];
  readonly pointer: { readonly x: number; readonly y: number };
  readonly flow: InsertionFlow;
}

export class InsertionModelError extends Error {
  override readonly name = "InsertionModelError";
}

const axisStart = (rect: Rect, axis: "x" | "y"): number => (axis === "x" ? rect.x : rect.y);
const axisEnd = (rect: Rect, axis: "x" | "y"): number =>
  axis === "x" ? rect.x + rect.width : rect.y + rect.height;

const normalize = (value: string): string => value.trim().toLowerCase();

const legacyFlexDirection = (value: string): FlexAxisInput["flexDirection"] => {
  switch (normalize(value)) {
    case "row-reverse":
      return "row-reverse";
    case "column":
      return "column";
    case "column-reverse":
      return "column-reverse";
    default:
      return "row";
  }
};

const progressionFor = (flow: InsertionFlow) =>
  flow.kind === "flex" ? resolveFlexAxis(flow.axis) : ({ axis: "y", sign: 1 } as const);

const indicatorPosition = (
  children: readonly ChildBox[],
  visualBoundaryIndex: number,
  axis: "x" | "y",
  pointer: number,
  domIndices: readonly number[],
): number => {
  if (children.length === 0) return pointer;
  const firstDomIndex = domIndices[0];
  const lastDomIndex = domIndices[domIndices.length - 1];
  const first = firstDomIndex === undefined ? undefined : children[firstDomIndex];
  const last = lastDomIndex === undefined ? undefined : children[lastDomIndex];
  if (visualBoundaryIndex === 0) return first === undefined ? pointer : axisStart(first.rect, axis);
  if (visualBoundaryIndex === children.length)
    return last === undefined ? pointer : axisEnd(last.rect, axis);
  const beforeDomIndex = domIndices[visualBoundaryIndex - 1];
  const afterDomIndex = domIndices[visualBoundaryIndex];
  const before = beforeDomIndex === undefined ? undefined : children[beforeDomIndex];
  const after = afterDomIndex === undefined ? undefined : children[afterDomIndex];
  return before === undefined || after === undefined
    ? pointer
    : (axisEnd(before.rect, axis) + axisStart(after.rect, axis)) / 2;
};

export const computeLogicalInsertionIndex = (input: LogicalInsertionInput): InsertionResult => {
  const progression = progressionFor(input.flow);
  const pointer = progression.axis === "x" ? input.pointer.x : input.pointer.y;
  const signedPointer = pointer * progression.sign;
  let domProgressBoundary = 0;
  for (const child of input.children) {
    const midpoint =
      ((axisStart(child.rect, progression.axis) + axisEnd(child.rect, progression.axis)) / 2) *
      progression.sign;
    if (midpoint < signedPointer) domProgressBoundary += 1;
    else break;
  }

  const visualBoundaryIndex =
    progression.sign === 1 ? domProgressBoundary : input.children.length - domProgressBoundary;
  const mapping = mapVisualBoundaryToDomIndex({
    childCount: input.children.length,
    visualBoundaryIndex,
    sign: progression.sign,
  });
  const order = visualDomOrder({ childCount: input.children.length, sign: progression.sign });
  if (!mapping.ok) throw new InsertionModelError(mapping.diagnostic.message);
  if (!order.ok) throw new InsertionModelError(order.diagnostic.message);

  return {
    parent: input.parent,
    index: mapping.domIndex,
    indicator: {
      axis: progression.axis,
      position: indicatorPosition(
        input.children,
        visualBoundaryIndex,
        progression.axis,
        pointer,
        order.domIndices,
      ),
    },
  };
};

/**
 * Compute the insertion index for a pointer inside a container (PRD section
 * 9.3 "Insertion Index 결정").
 *
 * Algorithm (midpoint comparison):
 * - flex-container with row direction → compare pointer X to child midpoints
 *   (horizontal flow).
 * - everything else (column flex, block flow, grid) → compare pointer Y to
 *   child midpoints (vertical flow, the default for normal-flow block layout).
 *
 * `flexDirection` carries the CSS `flex-direction` value so the axis can be
 * derived for a `flex-container` role (direction is not encoded in the role).
 *
 * The insertion index is the count of children whose midpoint is strictly less
 * than the pointer coordinate: a pointer in the upper/leading half of a child
 * inserts before it; the boundary at exactly a midpoint belongs to the earlier
 * child. For a vertical flex with children at y=0-50, 50-100, 100-150 and a
 * pointer at y=75, the midpoints are 25/75/125 and the index is 1 (between
 * child 0 and child 1).
 *
 * `parent` is echoed in the result so a caller piping many drop targets can
 * correlate each result to its container.
 */
export const computeInsertionIndex = (
  parent: ElementRef,
  children: readonly ChildBox[],
  pointerX: number,
  pointerY: number,
  layoutRole: LayoutRole,
  flexDirection: string = "",
): InsertionResult => {
  const flow: InsertionFlow =
    layoutRole === "flex-container"
      ? {
          kind: "flex",
          axis: {
            writingMode: "horizontal-tb",
            direction: "ltr",
            flexDirection: legacyFlexDirection(flexDirection),
          },
        }
      : { kind: "block" };
  return computeLogicalInsertionIndex({
    parent,
    children,
    pointer: { x: pointerX, y: pointerY },
    flow,
  });
};
