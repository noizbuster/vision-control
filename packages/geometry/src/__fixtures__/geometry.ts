import type { ElementRef } from "@vision-control/element-identity";
import type { GeometrySnapshot, Matrix2D, Rect } from "../index.js";

export const sampleRect: Rect = { x: 10, y: 20, width: 100, height: 50 };

export const sampleTarget: ElementRef = {
  runtimeId: "r_btn_1",
  sourceId: "s_btn",
  tagName: "button",
};

/** Identity matrix for baseline assertions. */
export const identityMatrix: Matrix2D = [1, 0, 0, 1, 0, 0];

export const sampleSnapshot: GeometrySnapshot = {
  target: sampleTarget,
  borderRect: { x: 0, y: 0, width: 40, height: 20 },
  paddingRect: { x: 1, y: 1, width: 38, height: 18 },
  contentRect: { x: 5, y: 5, width: 30, height: 10 },
  transform: [2, 0, 0, 2, 10, 20],
  scrollOffset: { x: 0, y: 30 },
  viewportSize: { x: 1280, y: 800 },
  capturedAt: 1_700_000_000_000,
};
