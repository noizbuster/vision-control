import type { ElementRef } from "@vision-control/element-identity";

import { describe, expect, it } from "vitest";

import { type ChildBox, computeInsertionIndex } from "./index.js";

const parent: ElementRef = { runtimeId: "parent-1", tagName: "div" };

const verticalChildren = (heights: readonly number[]): readonly ChildBox[] => {
  const out: ChildBox[] = [];
  let y = 0;
  for (const height of heights) {
    out.push({ rect: { x: 0, y, width: 100, height } });
    y += height;
  }
  return out;
};

const horizontalChildren = (widths: readonly number[]): readonly ChildBox[] => {
  const out: ChildBox[] = [];
  let x = 0;
  for (const width of widths) {
    out.push({ rect: { x, y: 0, width, height: 100 } });
    x += width;
  }
  return out;
};

describe("computeInsertionIndex — vertical flex-column / normal-flow-block", () => {
  const children = verticalChildren([50, 50, 50]);

  it("pointer at y=75 inserts at index 1 (between child 0 and child 1)", () => {
    const result = computeInsertionIndex(parent, children, 0, 75, "flex-container", "column");
    expect(result.index).toBe(1);
    expect(result.indicator.axis).toBe("y");
    expect(result.parent).toEqual(parent);
  });

  it("pointer in the top half of the first child inserts at index 0", () => {
    const result = computeInsertionIndex(parent, children, 0, 10, "normal-flow-block");
    expect(result.index).toBe(0);
  });

  it("pointer past the last midpoint inserts at the end", () => {
    const result = computeInsertionIndex(parent, children, 0, 200, "flex-container", "column");
    expect(result.index).toBe(3);
  });

  it("pointer exactly at a midpoint belongs to the earlier child", () => {
    expect(computeInsertionIndex(parent, children, 0, 25, "flex-container", "column").index).toBe(
      0,
    );
    expect(computeInsertionIndex(parent, children, 0, 75, "flex-container", "column").index).toBe(
      1,
    );
  });

  it("draws the drop indicator on the boundary between children", () => {
    const result = computeInsertionIndex(parent, children, 0, 75, "flex-container", "column");
    expect(result.indicator.position).toBe(50);
  });
});

describe("computeInsertionIndex — horizontal flex-container (row)", () => {
  const children = horizontalChildren([50, 50, 50]);

  it("uses the X axis for a row-direction flex-container", () => {
    const result = computeInsertionIndex(parent, children, 75, 0, "flex-container", "row");
    expect(result.index).toBe(1);
    expect(result.indicator.axis).toBe("x");
    expect(result.indicator.position).toBe(50);
  });

  it("pointer past the last midpoint inserts at the end", () => {
    expect(computeInsertionIndex(parent, children, 200, 0, "flex-container", "row").index).toBe(3);
  });
});

describe("computeInsertionIndex — empty container", () => {
  it("returns index 0 with the pointer position as the indicator", () => {
    const result = computeInsertionIndex(parent, [], 42, 17, "normal-flow-block");
    expect(result.index).toBe(0);
    expect(result.indicator.position).toBe(17);
  });
});
