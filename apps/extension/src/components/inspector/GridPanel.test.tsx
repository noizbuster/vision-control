import { cleanup, render, screen } from "@testing-library/react";
import type {
  GridCellPlacement,
  GridReorderCandidateSet,
  GridSpanCandidate,
} from "@vision-control/layout-engine";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GridPanel } from "./GridPanel.js";

const placement: GridCellPlacement = {
  row: 1,
  column: 2,
  rowEnd: 2,
  columnEnd: 3,
  rowSpan: 1,
  columnSpan: 1,
  rect: { x: 100, y: 0, width: 100, height: 50 },
};

const spanCandidates: readonly GridSpanCandidate[] = [
  { axis: "column", fromSpan: 1, toSpan: 2, rationale: "grow grid-column span by one track" },
  { axis: "row", fromSpan: 1, toSpan: 2, rationale: "grow grid-row span by one track" },
];

const reorderChoice: GridReorderCandidateSet = {
  domOrder: { kind: "dom-order-reorder", fromIndex: 0, toIndex: 2 },
  gridArea: {
    kind: "grid-area-placement",
    previousGridArea: "1 / 1 / 2 / 2",
    newGridArea: "1 / 2 / 2 / 3",
    a11ySafe: false,
  },
  unsupported: null,
};

describe("GridPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the empty state when placement is null", () => {
    render(
      <GridPanel
        placement={null}
        spanCandidates={[]}
        reorderChoice={null}
        a11yWarning={null}
        onChoosePlacement={vi.fn()}
        onResizeSpan={vi.fn()}
      />,
    );
    expect(screen.getByText("Selected element is not a grid item.")).toBeDefined();
  });

  it("renders the current cell placement", () => {
    render(
      <GridPanel
        placement={placement}
        spanCandidates={[]}
        reorderChoice={null}
        a11yWarning={null}
        onChoosePlacement={vi.fn()}
        onResizeSpan={vi.fn()}
      />,
    );
    expect(screen.getByText("row 1 / col 2")).toBeDefined();
    expect(screen.getByText("1 col x 1 row")).toBeDefined();
  });

  it("renders a span button per candidate and fires onResizeSpan on click", () => {
    const onResize = vi.fn();
    render(
      <GridPanel
        placement={placement}
        spanCandidates={spanCandidates}
        reorderChoice={null}
        a11yWarning={null}
        onChoosePlacement={vi.fn()}
        onResizeSpan={onResize}
      />,
    );
    const grow = screen.getByText("grow column span 1 -> 2");
    grow.click();
    expect(onResize).toHaveBeenCalledWith("column", 2);
  });

  it("renders both reorder choice buttons and fires onChoosePlacement", () => {
    const onChoose = vi.fn();
    render(
      <GridPanel
        placement={placement}
        spanCandidates={[]}
        reorderChoice={reorderChoice}
        a11yWarning={null}
        onChoosePlacement={onChoose}
        onResizeSpan={vi.fn()}
      />,
    );
    screen.getByText(/DOM order/).click();
    expect(onChoose).toHaveBeenCalledWith("dom-order");
    screen.getByText(/Grid area/).click();
    expect(onChoose).toHaveBeenCalledWith("grid-area");
  });

  it("surfaces the a11y warning as an alert", () => {
    render(
      <GridPanel
        placement={placement}
        spanCandidates={[]}
        reorderChoice={null}
        a11yWarning="Visual grid placement differs from DOM reading order."
        onChoosePlacement={vi.fn()}
        onResizeSpan={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("reading order");
  });

  it("notes the desync when the grid-area choice is not a11y-safe", () => {
    render(
      <GridPanel
        placement={placement}
        spanCandidates={[]}
        reorderChoice={reorderChoice}
        a11yWarning={null}
        onChoosePlacement={vi.fn()}
        onResizeSpan={vi.fn()}
      />,
    );
    expect(screen.getByText(/desyncs visual order/i)).toBeDefined();
  });
});
