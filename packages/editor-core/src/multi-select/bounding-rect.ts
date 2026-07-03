import type { Rect } from "@vision-control/geometry";

/**
 * Compute the bounding rectangle of a set of member rects: the smallest rect
 * that contains every input rect. Returns `null` for an empty list (no members
 * means no bounding box). Pure; no DOM access.
 */
export const computeBoundingRect = (rects: readonly Rect[]): Rect | null => {
  if (rects.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    const right = r.x + r.width;
    const bottom = r.y + r.height;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }

  return { x: minX, y: minY, width: maxRight - minX, height: maxBottom - minY };
};
