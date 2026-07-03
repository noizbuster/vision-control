import { describe, expect, it } from "vitest";

import type { GridCellPlacement } from "./grid-cell-inference.js";
import {
  buildGridReorderCandidates,
  type GridReorderCandidateInput,
} from "./grid-reorder-candidates.js";

const cell = (
  over: Partial<GridCellPlacement> & { column: number; row: number },
): GridCellPlacement => ({
  rowEnd: over.row + (over.rowSpan ?? 1),
  columnEnd: over.column + (over.columnSpan ?? 1),
  rowSpan: over.rowSpan ?? 1,
  columnSpan: over.columnSpan ?? 1,
  rect: { x: 0, y: 0, width: 100, height: 50 },
  ...over,
});

const base = (over: Partial<GridReorderCandidateInput>): GridReorderCandidateInput => ({
  source: cell({ column: 1, row: 1 }),
  target: cell({ column: 2, row: 1 }),
  fromIndex: 0,
  toIndex: 1,
  ...over,
});

describe("buildGridReorderCandidates — user-visible choice set", () => {
  it("produces BOTH a dom-order and a grid-area candidate so the UI can present a choice", () => {
    const result = buildGridReorderCandidates(base({}));
    expect(result.domOrder).toBeDefined();
    expect(result.gridArea).toBeDefined();
    expect(result.domOrder.kind).toBe("dom-order-reorder");
    expect(result.gridArea.kind).toBe("grid-area-placement");
  });

  it("the dom-order candidate carries fromIndex/toIndex (the DOM reorder pair)", () => {
    const result = buildGridReorderCandidates(base({ fromIndex: 0, toIndex: 2 }));
    expect(result.domOrder.fromIndex).toBe(0);
    expect(result.domOrder.toIndex).toBe(2);
  });

  it("the grid-area candidate carries previous + new grid-area strings", () => {
    const result = buildGridReorderCandidates(
      base({ previousGridArea: "1 / 1 / 2 / 2", newGridArea: "1 / 2 / 2 / 3" }),
    );
    expect(result.gridArea.previousGridArea).toBe("1 / 1 / 2 / 2");
    expect(result.gridArea.newGridArea).toBe("1 / 2 / 2 / 3");
  });

  it("derives the new grid-area string from the target placement when none is passed", () => {
    const result = buildGridReorderCandidates(base({}));
    // target column 2, row 1, span 1 => "row-start / col-start / row-end / col-end"
    // colEnd = colStart + span = 2 + 1 = 3.
    expect(result.gridArea.newGridArea).toBe("1 / 2 / 2 / 3");
  });

  it("records whether the target visual order matches DOM reading order", () => {
    const matches = buildGridReorderCandidates(base({ visualMatchesReadingOrder: true }));
    const differs = buildGridReorderCandidates(base({ visualMatchesReadingOrder: false }));
    expect(matches.gridArea.a11ySafe).toBe(true);
    expect(differs.gridArea.a11ySafe).toBe(false);
  });
});

describe("buildGridReorderCandidates — malformed input", () => {
  it("rejects a non-positive fromIndex", () => {
    const result = buildGridReorderCandidates(base({ fromIndex: -1 }));
    expect(result.unsupported).not.toBeNull();
  });

  it("rejects a toIndex equal to fromIndex (no-op drag) as unsupported", () => {
    const result = buildGridReorderCandidates(base({ fromIndex: 1, toIndex: 1 }));
    expect(result.unsupported).not.toBeNull();
  });
});
