/**
 * Hit testing that excludes overlay elements.
 *
 * `document.elementsFromPoint` returns every element under a point, including
 * the overlay host and its shadow DOM children. This module filters them out
 * and returns the first real page element.
 */

import type { Point } from "@vision-control/geometry";

import { isOverlayElement } from "./overlay-root.js";

/**
 * Find the first non-overlay element at `point`.
 *
 * @param point - Client coordinates.
 * @param overlayHost - The overlay host element to exclude from results.
 * @returns The first page element under the point, or `null` if only overlay
 *   content (or nothing) is present.
 */
export function hitTest(point: Point, overlayHost: HTMLElement): Element | null {
  const elements = elementsFromPoint(point);
  for (const element of elements) {
    if (!isOverlayElement(element, overlayHost)) {
      return element;
    }
  }
  return null;
}

/**
 * Return the stacked elements at a point.
 *
 * Falls back to `document.elementFromPoint` when `elementsFromPoint` is not
 * available (some test environments).
 */
function elementsFromPoint(point: Point): readonly Element[] {
  if (typeof document.elementsFromPoint === "function") {
    return document.elementsFromPoint(point.x, point.y);
  }

  const single = document.elementFromPoint(point.x, point.y);
  return single === null ? [] : [single];
}
