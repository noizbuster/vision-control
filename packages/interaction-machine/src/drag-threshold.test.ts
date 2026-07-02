import { describe, expect, it } from "vitest";

import { DRAG_THRESHOLD_PX, exceedsThreshold } from "./index.js";

describe("drag threshold", () => {
  it("default threshold sits in the 3-5px band", () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(3);
    expect(DRAG_THRESHOLD_PX).toBeLessThanOrEqual(5);
  });

  it("treats a sub-threshold movement as a click (not a drag)", () => {
    const start = { x: 0, y: 0 };
    expect(exceedsThreshold(start, { x: 2, y: 0 })).toBe(false);
    expect(exceedsThreshold(start, { x: 0, y: 1 })).toBe(false);
  });

  it("promotes to a drag once distance reaches the threshold", () => {
    const start = { x: 0, y: 0 };
    expect(exceedsThreshold(start, { x: DRAG_THRESHOLD_PX, y: 0 })).toBe(true);
    // diagonal that crosses the threshold
    expect(exceedsThreshold(start, { x: 3, y: 3 })).toBe(true);
  });

  it("honors a custom threshold", () => {
    const start = { x: 0, y: 0 };
    expect(exceedsThreshold(start, { x: 5, y: 0 }, 10)).toBe(false);
    expect(exceedsThreshold(start, { x: 10, y: 0 }, 10)).toBe(true);
  });
});
