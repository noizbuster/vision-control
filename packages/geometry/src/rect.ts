import { z } from "zod";

import type { Point } from "./point.js";

/**
 * A JSON-safe rectangle in plain numbers (`x, y` = top-left corner). No
 * `DOMRect`, no methods, no circular refs — round-trips through
 * `JSON.parse(JSON.stringify(...))` and crosses the protocol wire unchanged.
 */
export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Rect = z.infer<typeof RectSchema>;

/**
 * The subset of `DOMRect`/`DOMRectReadOnly` that callers may pass in. Defining
 * an interface (not importing the DOM type) keeps this package DOM-free: a
 * browser adapter passes a real `DOMRect`, a Node caller passes a plain object.
 */
export interface DomRectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Default tolerance for `rectEquals`. */
export const DEFAULT_RECT_TOLERANCE = 0.01;

/**
 * Convert a {@link DomRectLike} (a real `DOMRect` or a plain object) into a
 * JSON-safe {@link Rect}. Pure; does not read the DOM.
 */
export const rectFromDomRect = (r: DomRectLike): Rect => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});

/** Center point of `r`. */
export const rectCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** True when `point` lies inside (or on the edge of) `r` (half-open inclusive). */
export const rectContains = (r: Rect, point: Point): boolean =>
  point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height;

/** True when `a` and `b` overlap (touching edges count as intersecting). */
export const rectIntersects = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;

/**
 * Tolerance-based equality. Floating-point means exact `===` is wrong; compare
 * within `tolerance` (defaults to {@link DEFAULT_RECT_TOLERANCE}).
 */
export const rectEquals = (a: Rect, b: Rect, tolerance: number = DEFAULT_RECT_TOLERANCE): boolean =>
  Math.abs(a.x - b.x) <= tolerance &&
  Math.abs(a.y - b.y) <= tolerance &&
  Math.abs(a.width - b.width) <= tolerance &&
  Math.abs(a.height - b.height) <= tolerance;
