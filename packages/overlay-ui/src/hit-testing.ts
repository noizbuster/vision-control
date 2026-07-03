/**
 * Hit testing that excludes overlay elements.
 *
 * `document.elementsFromPoint` returns every element under a point, including
 * the overlay host and its shadow DOM children. This module filters them out
 * and returns the first real page element.
 *
 * `elementsFromRect` extends point hit-testing to a rectangle: it samples a
 * grid of points inside the rect, collects unique elements, and excludes
 * overlay content and closed-shadow-root elements (PRD §9.1 — elements inside
 * closed shadow roots or cross-origin iframes are never selectable).
 */

import type { Point, Rect } from "@vision-control/geometry";

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

/**
 * True when `element` lives inside a closed shadow root. Closed roots cannot be
 * inspected or edited (PRD §23.5). `elementsFromPoint` normally retargets to
 * the host for such elements, but this predicate also rejects any reference
 * that leaks out of one.
 */
export function isInsideClosedShadowRoot(element: Element): boolean {
  const root = element.getRootNode();
  if (!(root instanceof ShadowRoot)) return false;
  return root.mode === "closed";
}

/** Options for {@link elementsFromRect}. */
export interface ElementsFromRectOptions {
  /** Spacing between sample points in pixels. Default 16. */
  readonly sampleStep?: number;
}

/**
 * Compute the unique page elements under `rect` (PRD §9.1 marquee hit-testing).
 *
 * Samples a grid of points inside the rectangle, collects every element
 * returned by `document.elementsFromPoint` at those points, deduplicates in
 * first-seen order, and excludes:
 *
 * - Overlay elements (the host and shadow-root children).
 * - Elements inside a closed shadow root (never selectable).
 *
 * Cross-origin iframe **contents** are architecturally unreachable: the content
 * script runs in a single document, and `elementsFromPoint` never pierces into a
 * cross-origin frame's document. Same-origin iframe traversal requires
 * per-frame coordinate bridging and is deferred — this function operates in the
 * current document scope only.
 *
 * @param rect - Client-coordinate rectangle.
 * @param overlayHost - The overlay host element to exclude.
 * @param options - Sampling configuration.
 * @returns Deduplicated elements under the rect, in first-seen order.
 */
export function elementsFromRect(
  rect: Rect,
  overlayHost: HTMLElement,
  options: ElementsFromRectOptions = {},
): readonly Element[] {
  if (rect.width <= 0 || rect.height <= 0) return [];

  const step = options.sampleStep ?? DEFAULT_SAMPLE_STEP;
  const points = sampleRectGrid(rect, step);
  const seen = new Set<Element>();
  const result: Element[] = [];

  for (const point of points) {
    for (const element of elementsFromPoint(point)) {
      if (seen.has(element)) continue;
      seen.add(element);
      if (isOverlayElement(element, overlayHost)) continue;
      if (isInsideClosedShadowRoot(element)) continue;
      result.push(element);
    }
  }
  return result;
}

const DEFAULT_SAMPLE_STEP = 16;

/**
 * Generate sample points covering the rectangle: four corners, the center, and
 * a grid spaced `step` px apart. Enough density to catch small elements without
 * an explosion of `elementsFromPoint` calls.
 */
function sampleRectGrid(rect: Rect, step: number): readonly Point[] {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;

  const points: Point[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x0, y: y1 },
    { x: x1, y: y1 },
    { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
  ];

  for (let x = x0 + step; x < x1; x += step) {
    for (let y = y0 + step; y < y1; y += step) {
      points.push({ x, y });
    }
  }
  return points;
}
