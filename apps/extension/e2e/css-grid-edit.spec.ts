import { expect, test } from "@playwright/test";

import {
  computeInverse,
  type GridReorderOperation,
  type GridSpanOperation,
} from "@vision-control/change-ir";
import {
  buildGridReorderCandidates,
  type GridTrackInfo,
  generateGridSpanCandidates,
  inferGridCells,
  resolveGridIntent,
} from "@vision-control/layout-engine";

/**
 * @css-grid-edit — VC-V1V2-09 CSS Grid reorder, grid span, and grid-source intent.
 *
 * Verifies the V1 grid-aware flow that replaces the MVP `unsupported-grid`
 * diagnostic: cell inference → user-visible DOM-order-vs-grid-area choice →
 * semantic source intent, with the accessibility guard that a visual grid
 * placement never silently rewrites DOM order. Unit-level tests exercise the
 * full chain: inferGridCells → buildGridReorderCandidates → resolveGridIntent →
 * computeInverse. Browser tests require the built extension in Chromium.
 */

const TRACKS_3x2: GridTrackInfo = {
  columnLines: [0, 100, 200, 300],
  rowLines: [0, 50, 100],
};

test.describe("@css-grid-edit unit", () => {
  test("cell inference resolves an auto-placed child to its cell", () => {
    const cells = inferGridCells(TRACKS_3x2, [{ rect: { x: 105, y: 5, width: 90, height: 40 } }]);
    expect(cells[0]?.column).toBe(2);
    expect(cells[0]?.row).toBe(1);
  });

  test("reorder candidates present BOTH dom-order and grid-area options", () => {
    const source = {
      row: 1,
      column: 1,
      rowEnd: 2,
      columnEnd: 2,
      rowSpan: 1,
      columnSpan: 1,
      rect: { x: 0, y: 0, width: 100, height: 50 },
    };
    const target = {
      row: 1,
      column: 2,
      rowEnd: 2,
      columnEnd: 3,
      rowSpan: 1,
      columnSpan: 1,
      rect: { x: 100, y: 0, width: 100, height: 50 },
    };
    const choice = buildGridReorderCandidates({
      source,
      target,
      fromIndex: 0,
      toIndex: 1,
      visualMatchesReadingOrder: false,
    });
    expect(choice.domOrder.kind).toBe("dom-order-reorder");
    expect(choice.gridArea.kind).toBe("grid-area-placement");
    expect(choice.unsupported).toBeNull();
  });

  test("resolveGridIntent NEVER silently rewrites DOM order (unset defaults to grid-area)", () => {
    const resolution = resolveGridIntent({
      userChoice: "unset",
      fromIndex: 0,
      toIndex: 1,
      newGridArea: "1 / 2 / 2 / 3",
      accessibilitySemanticMatch: true,
      visualMatchesReadingOrder: false,
    });
    expect(resolution.kind).not.toBe("dom-order");
    expect(resolution.kind).toBe("grid-area");
  });

  test("resolveGridIntent surfaces an a11y warning on reading-order desync", () => {
    const resolution = resolveGridIntent({
      userChoice: "grid-area",
      fromIndex: 0,
      toIndex: 1,
      newGridArea: "1 / 2 / 2 / 3",
      accessibilitySemanticMatch: true,
      visualMatchesReadingOrder: false,
    });
    if (resolution.kind === "grid-area") {
      expect(resolution.a11yWarning).not.toBeNull();
      expect(resolution.a11yWarning).toMatch(/reading order|accessibility/i);
    }
  });

  test("grid-span candidates propose a grow when room remains", () => {
    const placement = {
      row: 1,
      column: 1,
      rowEnd: 2,
      columnEnd: 2,
      rowSpan: 1,
      columnSpan: 1,
      rect: { x: 0, y: 0, width: 100, height: 50 },
    };
    const candidates = generateGridSpanCandidates(placement, TRACKS_3x2);
    expect(candidates.some((c) => c.axis === "column" && c.toSpan === 2)).toBe(true);
  });

  test("grid-reorder operation with grid-area placement round-trips through computeInverse", () => {
    const op: GridReorderOperation = {
      kind: "grid-reorder",
      id: "grid-reorder-0001",
      timestamp: 1000,
      runtime: false,
      grid: { runtimeId: "grid-r01" },
      child: { runtimeId: "card-r01" },
      placement: "grid-area",
      fromIndex: 0,
      toIndex: 0,
      previousGridArea: "1 / 1 / 2 / 2",
      newGridArea: "1 / 2 / 2 / 3",
    };
    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("grid-reorder");
    if (inverse.kind === "grid-reorder") {
      expect(inverse.previousGridArea).toBe("1 / 2 / 2 / 3");
      expect(inverse.newGridArea).toBe("1 / 1 / 2 / 2");
    }
  });

  test("grid-span operation round-trips through computeInverse (swaps fromSpan/toSpan)", () => {
    const op: GridSpanOperation = {
      kind: "grid-span",
      id: "grid-span-0001",
      timestamp: 1000,
      runtime: false,
      grid: { runtimeId: "grid-r01" },
      child: { runtimeId: "card-r01" },
      axis: "column",
      fromSpan: 1,
      toSpan: 2,
    };
    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("grid-span");
    if (inverse.kind === "grid-span") {
      expect(inverse.fromSpan).toBe(2);
      expect(inverse.toSpan).toBe(1);
    }
  });
});

test.describe("@css-grid-edit browser", () => {
  // OUT: panel-context — grid-placement emission publishes to the `useGridPlacement` hook in the DevTools panel (GridPanel); the overlay harness opens the content runtime + overlay only. Grid-child selection stamps a generic preview id, so the grid-specific behavior is only observable in the panel. Unit tests above cover inferGridCells → resolveGridIntent → computeInverse end-to-end.
  test.fixme("drag a grid card to a new cell and choose grid-area placement", async () => {
    // Given: a 3-column CSS Grid with auto-placed cards on the MVP Board fixture.
    // When: the user drags card A to column 2 and chooses "Grid area" in the inspector.
    // Then: a grid-reorder operation with placement "grid-area" is recorded; DOM order is unchanged.
    // Assert: journal kind === "grid-reorder" and placement === "grid-area"; DOM children order unchanged.
  });

  // OUT: panel-context — grid drag/span outcomes render in the DevTools panel (GridPanel + journal); the overlay harness cannot open the panel context.
  test.fixme("drag a grid card and choose DOM-order reorder when a11y semantics match", async () => {
    // Given: a grid of semantic list items where DOM order is meaningful.
    // When: the user drags an item and chooses "DOM order".
    // Then: a grid-reorder operation with placement "dom-order" is recorded; DOM order follows the visual move.
    // Assert: journal kind === "grid-reorder" and placement === "dom-order".
  });

  // OUT: panel-context — the a11y warning + default placement surface in the DevTools panel; the overlay harness cannot open the panel context.
  test.fixme("grid visual reorder surfaces an a11y warning and does NOT auto-commit DOM order", async () => {
    // Given: a grid where a visual reorder would desync reading order.
    // When: the user drags a card without an explicit choice.
    // Then: the default resolves to grid-area (NOT a silent DOM rewrite); an a11y warning is shown.
    // Assert: no dom-order operation recorded without explicit opt-in; warning visible in inspector.
  });

  // OUT: panel-context — the span control renders in the DevTools panel (GridPanel); the overlay harness cannot open the panel context.
  test.fixme("grid-column span 2 resize works", async () => {
    // Given: a grid child with column span 1.
    // When: the user grows the span to 2 via the inspector span control.
    // Then: a grid-span operation with axis "column", fromSpan 1, toSpan 2 is recorded.
    // Assert: journal kind === "grid-span"; the inverse restores span 1.
  });
});
