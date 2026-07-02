import { z } from "zod";

/**
 * A 2D point in plain numbers. JSON-safe; no DOM coupling. The coordinate
 * space a `Point` lives in is implicit and owned by the caller (client,
 * viewport, page, frame-local, ...).
 */
export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point = z.infer<typeof PointSchema>;

/** Default floating-point tolerance for `equals`. */
export const DEFAULT_POINT_TOLERANCE = 1e-6;

/** `a + b`. */
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

/** `a - b`. */
export const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/** Euclidean distance between `a` and `b`. */
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Tolerance-based equality. Floating-point means exact `===` is wrong for
 * geometry; compare within `tolerance` (defaults to {@link DEFAULT_POINT_TOLERANCE}).
 */
export const equals = (a: Point, b: Point, tolerance: number = DEFAULT_POINT_TOLERANCE): boolean =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
