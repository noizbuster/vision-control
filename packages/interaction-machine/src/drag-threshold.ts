import { distance, type Point } from "@vision-control/geometry";

/**
 * Drag threshold (PRD section 9.3): a pointer must move at least this many CSS
 * pixels before a press is promoted from a click to a drag. The value sits in
 * the conventional 3-5 px band; 4 px is a stable default that absorbs sub-pixel
 * jitter and accidental micro-movements without requiring an explicit intent.
 */
export const DRAG_THRESHOLD_PX = 4;

/**
 * Returns true when the pointer has travelled far enough from `start` to
 * `current` to be considered a drag rather than a click. Below the threshold
 * the press stays a click; at or above it the drag gesture begins.
 *
 * `threshold` defaults to {@link DRAG_THRESHOLD_PX}; callers may pass a smaller
 * value for touch (which has more inherent jitter) or larger for coarse input.
 */
export const exceedsThreshold = (
  start: Point,
  current: Point,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean => distance(start, current) >= threshold;
