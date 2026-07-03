import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";

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

const axisStart = (rect: Rect, axis: "x" | "y"): number => (axis === "x" ? rect.x : rect.y);
const axisEnd = (rect: Rect, axis: "x" | "y"): number =>
  axis === "x" ? rect.x + rect.width : rect.y + rect.height;

const flowAxis = (role: LayoutRole, flexDirection: string): "x" | "y" => {
  if (role === "flex-container" && !normalize(flexDirection).startsWith("column")) {
    return "x";
  }
  return "y";
};

const normalize = (value: string): string => value.trim().toLowerCase();

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
  const axis = flowAxis(layoutRole, flexDirection);
  const pointer = axis === "x" ? pointerX : pointerY;

  let index = 0;
  for (const child of children) {
    const mid = (axisStart(child.rect, axis) + axisEnd(child.rect, axis)) / 2;
    if (mid < pointer) {
      index += 1;
    } else {
      break;
    }
  }

  let position: number;
  if (children.length === 0) {
    position = pointer;
  } else if (index === 0) {
    const first = children[0];
    position = first === undefined ? pointer : axisStart(first.rect, axis);
  } else if (index === children.length) {
    const last = children[children.length - 1];
    position = last === undefined ? pointer : axisEnd(last.rect, axis);
  } else {
    const before = children[index - 1];
    const after = children[index];
    position =
      before === undefined || after === undefined
        ? pointer
        : (axisEnd(before.rect, axis) + axisStart(after.rect, axis)) / 2;
  }

  return { parent, index, indicator: { axis, position } };
};
