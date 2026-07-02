import type { ElementRef } from "@vision-control/element-identity";

import type { Point } from "./point.js";
import type { Rect } from "./rect.js";

/**
 * Type-only description of a single scrollable ancestor. The actual DOM
 * discovery (walking `element.parentElement`, reading `getComputedStyle`
 * `overflow`, measuring `scrollWidth`/`scrollHeight`) lives in browser packages
 * (`packages/inspector-core`, task 14). This module only defines the data shape
 * and a pure offset accumulator so the geometry package stays DOM-free.
 */
export interface ScrollParent {
  /** The scrollable ancestor element. */
  readonly element: ElementRef;
  /** Current scroll position of this container (scrollLeft, scrollTop). */
  readonly scrollOffset: Point;
  /** Scrollable range: `{ x: 0, y: 0, width: maxScrollX, height: maxScrollY }`. */
  readonly scrollRange: Rect;
}

/**
 * Sum the scroll offsets of a chain of scroll parents (root-first or
 * leaf-first; addition is commutative). Returns the total scroll offset to
 * feed into the coordinate-conversion functions. Pure; no DOM access.
 */
export const accumulateScrollOffset = (parents: ReadonlyArray<ScrollParent>): Point => {
  let x = 0;
  let y = 0;
  for (const parent of parents) {
    x += parent.scrollOffset.x;
    y += parent.scrollOffset.y;
  }
  return { x, y };
};
