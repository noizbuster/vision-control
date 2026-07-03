import { describe, expect, it } from "vitest";

import type { GridCellPlacement, GridTrackInfo } from "./grid-cell-inference.js";
import { generateGridSpanCandidates } from "./grid-span-candidates.js";

const TRACKS_3x2: GridTrackInfo = {
  columnLines: [0, 100, 200, 300],
  rowLines: [0, 50, 100],
};

const cell = (over: Partial<GridCellPlacement>): GridCellPlacement => ({
  row: 1,
  column: 1,
  rowEnd: 2,
  columnEnd: 2,
  rowSpan: 1,
  columnSpan: 1,
  rect: { x: 0, y: 0, width: 100, height: 50 },
  ...over,
});

describe("generateGridSpanCandidates — column span", () => {
  it("proposes increasing the column span when room remains to the right", () => {
    const candidates = generateGridSpanCandidates(cell({ column: 1, columnSpan: 1 }), TRACKS_3x2);
    const grow = candidates.find((c) => c.axis === "column" && c.toSpan > c.fromSpan);
    expect(grow).toBeDefined();
    if (grow !== undefined) {
      expect(grow.fromSpan).toBe(1);
      expect(grow.toSpan).toBe(2);
    }
  });

  it("does NOT propose growing the column span past the grid edge", () => {
    // child at column 3 (last column), span 1 — cannot grow.
    const candidates = generateGridSpanCandidates(
      cell({ column: 3, columnEnd: 4, columnSpan: 1 }),
      TRACKS_3x2,
    );
    const grow = candidates.find((c) => c.axis === "column" && c.toSpan > c.fromSpan);
    expect(grow).toBeUndefined();
  });

  it("proposes decreasing the column span when the current span is greater than 1", () => {
    const candidates = generateGridSpanCandidates(
      cell({ column: 1, columnEnd: 3, columnSpan: 2 }),
      TRACKS_3x2,
    );
    const shrink = candidates.find((c) => c.axis === "column" && c.toSpan < c.fromSpan);
    expect(shrink).toBeDefined();
    if (shrink !== undefined) {
      expect(shrink.fromSpan).toBe(2);
      expect(shrink.toSpan).toBe(1);
    }
  });
});

describe("generateGridSpanCandidates — row span", () => {
  it("proposes increasing the row span when room remains below", () => {
    const candidates = generateGridSpanCandidates(cell({ row: 1, rowSpan: 1 }), TRACKS_3x2);
    const grow = candidates.find((c) => c.axis === "row" && c.toSpan > c.fromSpan);
    expect(grow).toBeDefined();
  });

  it("does NOT propose growing the row span past the grid edge", () => {
    const candidates = generateGridSpanCandidates(
      cell({ row: 2, rowEnd: 3, rowSpan: 1 }),
      TRACKS_3x2,
    );
    const grow = candidates.find((c) => c.axis === "row" && c.toSpan > c.fromSpan);
    expect(grow).toBeUndefined();
  });
});

describe("generateGridSpanCandidates — invariants", () => {
  it("never proposes a span less than 1", () => {
    const candidates = generateGridSpanCandidates(cell({ columnSpan: 1, rowSpan: 1 }), TRACKS_3x2);
    for (const c of candidates) {
      expect(c.toSpan).toBeGreaterThanOrEqual(1);
    }
  });

  it("carries a human-readable rationale on every candidate", () => {
    const candidates = generateGridSpanCandidates(cell({ columnSpan: 1 }), TRACKS_3x2);
    for (const c of candidates) {
      expect(c.rationale.length).toBeGreaterThan(0);
    }
  });

  it("returns an empty set when the grid has no tracks", () => {
    const empty: GridTrackInfo = { columnLines: [], rowLines: [] };
    expect(generateGridSpanCandidates(cell({ column: 1, row: 1 }), empty)).toEqual([]);
  });
});
