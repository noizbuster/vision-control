import type { ElementRef } from "@vision-control/element-identity";
import { describe, expect, it } from "vitest";

import { computeLogicalInsertionIndex } from "./index.js";

const parent: ElementRef = { runtimeId: "logical-parent", tagName: "div" };

describe("computeLogicalInsertionIndex", () => {
  it("maps row-reverse physical boundary 1 to literal DOM index 2", () => {
    const result = computeLogicalInsertionIndex({
      parent,
      children: [
        { rect: { x: 140, y: 0, width: 50, height: 40 } },
        { rect: { x: 70, y: 0, width: 50, height: 40 } },
        { rect: { x: 0, y: 0, width: 50, height: 40 } },
      ],
      pointer: { x: 40, y: 20 },
      flow: {
        kind: "flex",
        axis: { writingMode: "horizontal-tb", direction: "ltr", flexDirection: "row-reverse" },
      },
    });

    expect(result.index).toBe(2);
    expect(result.indicator).toEqual({ axis: "x", position: 60 });
  });

  it("maps RTL row physical boundary 1 to literal DOM index 2", () => {
    const result = computeLogicalInsertionIndex({
      parent,
      children: [
        { rect: { x: 140, y: 0, width: 50, height: 40 } },
        { rect: { x: 70, y: 0, width: 50, height: 40 } },
        { rect: { x: 0, y: 0, width: 50, height: 40 } },
      ],
      pointer: { x: 40, y: 20 },
      flow: {
        kind: "flex",
        axis: { writingMode: "horizontal-tb", direction: "rtl", flexDirection: "row" },
      },
    });

    expect(result.index).toBe(2);
    expect(result.indicator).toEqual({ axis: "x", position: 60 });
  });

  it("uses physical Y for vertical-rl row flow", () => {
    const result = computeLogicalInsertionIndex({
      parent,
      children: [
        { rect: { x: 0, y: 0, width: 40, height: 50 } },
        { rect: { x: 0, y: 70, width: 40, height: 50 } },
        { rect: { x: 0, y: 140, width: 40, height: 50 } },
      ],
      pointer: { x: 20, y: 130 },
      flow: {
        kind: "flex",
        axis: { writingMode: "vertical-rl", direction: "ltr", flexDirection: "row" },
      },
    });

    expect(result.index).toBe(2);
    expect(result.indicator).toEqual({ axis: "y", position: 130 });
  });
});
