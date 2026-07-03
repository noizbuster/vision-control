import type { ElementRef } from "@vision-control/element-identity";
import { describe, expect, it } from "vitest";
import type { SnapCandidate } from "./snap-candidate.js";
import { computeSnapCandidates, type SnapInput } from "./snap-engine.js";

const siblingRef: ElementRef = {
  runtimeId: "sib-1",
  tagName: "div",
};

const base = (over: Partial<SnapInput>): SnapInput => ({
  target: { rect: { x: 200, y: 200, width: 40, height: 40 } },
  pointer: { x: 0, y: 0 },
  config: { threshold: 8 },
  ...over,
});

/**
 * X-axis-focused helper: parks the pointer's y far from every source so only
 * x-axis candidates survive the threshold, keeping x-axis assertions honest.
 */
const xCandidates = (over: Partial<SnapInput>, pointerX: number): readonly SnapCandidate[] =>
  computeSnapCandidates(base({ ...over, pointer: { x: pointerX, y: 9999 } }));

describe("computeSnapCandidates — stopping condition: near sibling edge", () => {
  it("emits an edge candidate with distance < threshold when the pointer is near a sibling edge", () => {
    // Sibling left edge at x = 100. Pointer at x = 102. Threshold = 8.
    const result = xCandidates(
      { siblings: [{ rect: { x: 100, y: 0, width: 50, height: 50 }, ref: siblingRef }] },
      102,
    );
    const leftEdge = result.find((c) => c.kind === "edge" && c.axis === "x" && c.value === 100);
    expect(leftEdge).toBeDefined();
    if (leftEdge === undefined) return;
    expect(leftEdge.distance).toBe(2);
    expect(leftEdge.distance).toBeLessThan(8);
    expect(leftEdge.source).toEqual(siblingRef);
  });

  it("returns candidates sorted by distance ascending", () => {
    const result = xCandidates(
      { siblings: [{ rect: { x: 100, y: 0, width: 50, height: 50 } }] },
      101,
    );
    const distances = result.map((c) => c.distance);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
  });

  it("the nearest candidate is the sibling edge the pointer is closest to", () => {
    // Sibling spans x [100,150]; pointer at 102 is closest to 100 (dist 2) vs 150 (dist 48).
    const result = xCandidates(
      { siblings: [{ rect: { x: 100, y: 0, width: 50, height: 50 } }] },
      102,
    );
    expect(result[0]?.value).toBe(100);
    expect(result[0]?.distance).toBe(2);
  });
});

describe("computeSnapCandidates — stopping condition: 8px grid snaps to nearest 8", () => {
  it("emits a grid candidate at the nearest 8px multiple", () => {
    // Pointer at x = 9; nearest multiple of 8 is 8 (distance 1).
    const result = xCandidates({ config: { threshold: 8, gridSpacing: 8 } }, 9);
    const grid = result.find((c) => c.kind === "grid" && c.axis === "x");
    expect(grid).toBeDefined();
    if (grid === undefined) return;
    expect(grid.value).toBe(8);
    expect(grid.distance).toBe(1);
  });

  it("snaps to 16 when the pointer is closer to 16 than to 8", () => {
    // Pointer at x = 13: 13/8 = 1.625 → round → 2 → 16 (distance 3) beats 8 (distance 5).
    const result = xCandidates({ config: { threshold: 8, gridSpacing: 8 } }, 13);
    const grid = result.find((c) => c.kind === "grid" && c.axis === "x");
    expect(grid).toBeDefined();
    expect(grid?.value).toBe(16);
    expect(grid?.distance).toBe(3);
  });

  it("respects a non-zero grid origin", () => {
    // Origin x=4, spacing 8: grid lines at ...,4,12,20,... Pointer at 10 → nearest 12.
    const result = computeSnapCandidates(
      base({
        config: { threshold: 8, gridSpacing: 8, gridOrigin: { x: 4, y: 0 } },
        pointer: { x: 10, y: 0 },
      }),
    );
    const grid = result.find((c) => c.kind === "grid" && c.axis === "x");
    expect(grid?.value).toBe(12);
  });

  it("supports a 4px grid (PRD §9.8 configurable grid)", () => {
    // Pointer at 9; nearest multiple of 4 is 8 (distance 1).
    const result = xCandidates({ config: { threshold: 8, gridSpacing: 4 } }, 9);
    const grid = result.find((c) => c.kind === "grid" && c.axis === "x");
    expect(grid?.value).toBe(8);
  });
});

describe("computeSnapCandidates — stopping condition: far pointer yields no candidate", () => {
  it("returns an empty list when the pointer is far from every source and no grid is set", () => {
    // Sibling at x [100,150], parent at x [0,400]x[0,300]; pointer at {999,999} — far on both axes.
    const result = computeSnapCandidates(
      base({
        parent: { rect: { x: 0, y: 0, width: 400, height: 300 } },
        siblings: [{ rect: { x: 100, y: 0, width: 50, height: 50 } }],
        pointer: { x: 999, y: 999 },
      }),
    );
    expect(result).toEqual([]);
  });

  it("returns an empty list with no sources configured", () => {
    expect(computeSnapCandidates(base({}))).toEqual([]);
  });
});

describe("computeSnapCandidates — source coverage", () => {
  it("emits a parent edge candidate when the pointer is near the edge", () => {
    const result = computeSnapCandidates(
      base({
        parent: { rect: { x: 0, y: 0, width: 200, height: 200 }, ref: siblingRef },
        pointer: { x: 1, y: 9999 },
      }),
    );
    const leftEdge = result.find((c) => c.kind === "edge" && c.value === 0 && c.axis === "x");
    expect(leftEdge).toBeDefined();
    expect(leftEdge?.source).toEqual(siblingRef);
  });

  it("emits a parent center candidate when the pointer is near the center", () => {
    const result = computeSnapCandidates(
      base({
        parent: { rect: { x: 0, y: 0, width: 200, height: 200 }, ref: siblingRef },
        pointer: { x: 99, y: 9999 },
      }),
    );
    const centerX = result.find((c) => c.kind === "center" && c.value === 100 && c.axis === "x");
    expect(centerX).toBeDefined();
    expect(centerX?.source).toEqual(siblingRef);
  });

  it("emits a baseline candidate for a text-bearing sibling (y-axis)", () => {
    const result = computeSnapCandidates(
      base({
        siblings: [{ rect: { x: 0, y: 0, width: 100, height: 20 }, baseline: 16, ref: siblingRef }],
        pointer: { x: 0, y: 17 },
      }),
    );
    const baseline = result.find((c) => c.kind === "baseline" && c.axis === "y");
    expect(baseline).toBeDefined();
    expect(baseline?.value).toBe(16);
    expect(baseline?.distance).toBe(1);
    expect(baseline?.source).toEqual(siblingRef);
  });

  it("emits explicit grid-line candidates", () => {
    const result = computeSnapCandidates(
      base({
        gridLines: { x: [50, 150], y: [30] },
        pointer: { x: 52, y: 0 },
      }),
    );
    const grid = result.find((c) => c.kind === "grid" && c.axis === "x" && c.value === 50);
    expect(grid).toBeDefined();
    expect(grid?.distance).toBe(2);
  });

  it("emits spacing-token candidates carrying the token name", () => {
    // Sibling right edge at x = 100; token "space-4" = 16 → candidate at 116.
    const result = computeSnapCandidates(
      base({
        siblings: [{ rect: { x: 50, y: 0, width: 50, height: 50 }, ref: siblingRef }],
        tokens: [{ name: "space-4", value: 16 }],
        pointer: { x: 117, y: 0 },
      }),
    );
    const tokenCandidate = result.find(
      (c) => c.kind === "spacing-token" && c.value === 116 && c.axis === "x",
    );
    expect(tokenCandidate).toBeDefined();
    expect(tokenCandidate?.token).toBe("space-4");
    expect(tokenCandidate?.source).toEqual(siblingRef);
    expect(tokenCandidate?.distance).toBe(1);
  });

  it("filters out candidates beyond the threshold", () => {
    // Sibling at 100; pointer at 120; threshold 8 → 100 is distance 20, filtered.
    const result = xCandidates(
      { siblings: [{ rect: { x: 100, y: 0, width: 10, height: 10 } }], config: { threshold: 8 } },
      120,
    );
    expect(result.find((c) => c.value === 100)).toBeUndefined();
  });
});

describe("computeSnapCandidates — advisory contract", () => {
  it("never mutates the input", () => {
    const input = base({
      siblings: [{ rect: { x: 100, y: 0, width: 10, height: 10 } }],
      pointer: { x: 101, y: 0 },
    });
    const snapshot = JSON.parse(JSON.stringify(input)) as SnapInput;
    computeSnapCandidates(input);
    expect(JSON.parse(JSON.stringify(input)) as SnapInput).toEqual(snapshot);
  });

  it("grid candidate has no source or token attribute", () => {
    const result = xCandidates({ config: { threshold: 8, gridSpacing: 8 } }, 9);
    const grid = result.find((c) => c.kind === "grid");
    expect(grid).toBeDefined();
    expect(grid?.source).toBeUndefined();
    expect(grid?.token).toBeUndefined();
  });
});
