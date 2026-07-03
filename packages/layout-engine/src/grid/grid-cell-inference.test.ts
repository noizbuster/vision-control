import { describe, expect, it } from "vitest";

import {
  type GridChildPlacementInput,
  type GridTrackInfo,
  inferGridCells,
} from "./grid-cell-inference.js";

/**
 * A 3x2 grid with 100px columns and 50px rows. Lines (1-based):
 *   column lines: 1=0px, 2=100px, 3=200px, 4=300px
 *   row lines:    1=0px, 2=50px,  3=100px
 */
const TRACKS_3x2: GridTrackInfo = {
  columnLines: [0, 100, 200, 300],
  rowLines: [0, 50, 100],
};

describe("inferGridCells — explicit placements", () => {
  it("resolves an explicit grid-column/row start+end to a cell with span", () => {
    const children: readonly GridChildPlacementInput[] = [
      {
        rect: { x: 0, y: 0, width: 200, height: 50 },
        gridColumnStart: 1,
        gridColumnEnd: 3,
        gridRowStart: 1,
        gridRowEnd: 2,
      },
    ];
    const [cell] = inferGridCells(TRACKS_3x2, children);
    expect(cell).toBeDefined();
    if (cell !== undefined) {
      expect(cell.column).toBe(1);
      expect(cell.row).toBe(1);
      expect(cell.columnSpan).toBe(2);
      expect(cell.rowSpan).toBe(1);
    }
  });

  it("treats a single-line end as a span of 1 (start === end - 1)", () => {
    const children: readonly GridChildPlacementInput[] = [
      {
        rect: { x: 100, y: 50, width: 100, height: 50 },
        gridColumnStart: 2,
        gridColumnEnd: 3,
        gridRowStart: 2,
        gridRowEnd: 3,
      },
    ];
    const [cell] = inferGridCells(TRACKS_3x2, children);
    if (cell !== undefined) {
      expect(cell.column).toBe(2);
      expect(cell.row).toBe(2);
      expect(cell.columnSpan).toBe(1);
      expect(cell.rowSpan).toBe(1);
    }
  });

  it("clamps explicit lines that run past the declared tracks", () => {
    const children: readonly GridChildPlacementInput[] = [
      {
        rect: { x: 0, y: 0, width: 300, height: 100 },
        gridColumnStart: 1,
        gridColumnEnd: 9,
        gridRowStart: 1,
        gridRowEnd: 9,
      },
    ];
    const [cell] = inferGridCells(TRACKS_3x2, children);
    if (cell !== undefined) {
      expect(cell.columnEnd).toBe(4);
      expect(cell.rowEnd).toBe(3);
      expect(cell.columnSpan).toBe(3);
      expect(cell.rowSpan).toBe(2);
    }
  });
});

describe("inferGridCells — auto placement from rect", () => {
  it("infers the column/row from a rect that sits inside a single cell", () => {
    const children: readonly GridChildPlacementInput[] = [
      { rect: { x: 105, y: 5, width: 90, height: 40 } },
    ];
    const [cell] = inferGridCells(TRACKS_3x2, children);
    if (cell !== undefined) {
      expect(cell.column).toBe(2);
      expect(cell.row).toBe(1);
      expect(cell.columnSpan).toBe(1);
      expect(cell.rowSpan).toBe(1);
    }
  });

  it("infers a 2-column span from a rect that straddles two columns", () => {
    const children: readonly GridChildPlacementInput[] = [
      { rect: { x: 50, y: 0, width: 150, height: 50 } },
    ];
    const [cell] = inferGridCells(TRACKS_3x2, children);
    if (cell !== undefined) {
      expect(cell.column).toBe(1);
      expect(cell.columnSpan).toBe(2);
    }
  });

  it("resolves children in DOM order (input order is preserved)", () => {
    const children: readonly GridChildPlacementInput[] = [
      { rect: { x: 200, y: 50, width: 100, height: 50 } },
      { rect: { x: 0, y: 0, width: 100, height: 50 } },
    ];
    const cells = inferGridCells(TRACKS_3x2, children);
    expect(cells.length).toBe(2);
    expect(cells[0]?.column).toBe(3);
    expect(cells[0]?.row).toBe(2);
    expect(cells[1]?.column).toBe(1);
    expect(cells[1]?.row).toBe(1);
  });
});

describe("inferGridCells — malformed input (malformed-input guard)", () => {
  it("returns an empty array for no children", () => {
    expect(inferGridCells(TRACKS_3x2, [])).toEqual([]);
  });

  it("returns an empty array when there are no tracks", () => {
    const empty: GridTrackInfo = { columnLines: [], rowLines: [] };
    expect(inferGridCells(empty, [{ rect: { x: 0, y: 0, width: 10, height: 10 } }])).toEqual([]);
  });

  it("clamps a rect whose leading edge is before the first line to line 1", () => {
    const children: readonly GridChildPlacementInput[] = [
      { rect: { x: -50, y: -20, width: 60, height: 30 } },
    ];
    const [cell] = inferGridCells(TRACKS_3x2, children);
    if (cell !== undefined) {
      expect(cell.column).toBe(1);
      expect(cell.row).toBe(1);
    }
  });

  it("clamps a rect beyond the last track to the final cell", () => {
    const children: readonly GridChildPlacementInput[] = [
      { rect: { x: 400, y: 200, width: 50, height: 50 } },
    ];
    const [cell] = inferGridCells(TRACKS_3x2, children);
    if (cell !== undefined) {
      expect(cell.column).toBe(3);
      expect(cell.row).toBe(2);
      expect(cell.columnSpan).toBe(1);
      expect(cell.rowSpan).toBe(1);
    }
  });
});
