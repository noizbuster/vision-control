/**
 * Geometry (bounding rect) assertion with tolerance.
 *
 * For layout-affecting operations (resize, reparent into a flex container):
 * verifies the element's bounding rect is within `tolerance` of the expected
 * rect. The tolerance handles subpixel rendering (±1px default) so a rect at
 * `x=10.3` passes against an expected `x=10` with tolerance 1.
 */

import { type Rect, rectEquals } from "@vision-control/geometry";

import type { AssertionResult, ResolvedTarget } from "../types.js";
import { DEFAULT_GEOMETRY_TOLERANCE } from "../types.js";

/** Format a rect for the report. */
function formatRect(r: Rect): string {
  return `{x:${r.x}, y:${r.y}, w:${r.width}, h:${r.height}}`;
}

/**
 * Assert the target's bounding rect is within `tolerance` of `expectedRect`.
 *
 * All four components (x, y, width, height) must be within tolerance. The
 * default tolerance is {@link DEFAULT_GEOMETRY_TOLERANCE} (1px).
 */
export function assertGeometry(
  target: ResolvedTarget,
  expectedRect: Rect,
  tolerance: number = DEFAULT_GEOMETRY_TOLERANCE,
): AssertionResult {
  const actual = target.dom.getRect(target.element);
  const passed = rectEquals(actual, expectedRect, tolerance);
  return {
    name: "geometry",
    passed,
    expected: `${formatRect(expectedRect)} (±${tolerance}px)`,
    actual: formatRect(actual),
    message: passed
      ? "Bounding rect is within tolerance."
      : `Geometry mismatch: expected ${formatRect(expectedRect)} within ${tolerance}px but got ${formatRect(actual)}.`,
  };
}
