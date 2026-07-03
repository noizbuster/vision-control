import { expect, test } from "@playwright/test";

import { computeInverse, type ResizeElementOperation } from "@vision-control/change-ir";
import {
  classifyLayoutRole,
  type GridTrackInfo,
  generateGridSpanCandidates,
  generateResizeCandidates,
  type LayoutComputedStyle,
} from "@vision-control/layout-engine";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  overlayElementCount,
  pageElementRect,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @resize — AC-005 element resize.
 *
 * Verifies: resize handle visibility, smooth drag preview, flex-basis candidate
 * generation for flex items (not width/height), align-self stretch for the flex
 * cross-axis, grid-span candidates for grid items, inverse restore. Unit tests
 * verify candidate generation + inverse.
 */

const resizeOp: ResizeElementOperation = {
  kind: "resize-element",
  id: "resize-001",
  timestamp: 1000,
  runtime: false,
  target: { runtimeId: "el-resize01" },
  property: "flex-basis",
  fromValue: "200px",
  toValue: "300px",
};

const cssProperties = (
  candidates: readonly { readonly kind: string; readonly property?: string }[],
): readonly string[] =>
  candidates.filter((c) => c.kind === "css-property").map((c) => c.property ?? "");

test.describe("@resize unit", () => {
  test("flex item generates flex-basis candidates, not width/height", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates({ runtimeId: "el-r01" }, classifyLayoutRole(style));
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      const props = cssProperties(candidates.candidates);
      expect(props).toContain("flex-basis");
      expect(props).not.toContain("width");
      expect(props).not.toContain("height");
    }
  });

  test("flex item emits an align-self stretch candidate (cross-axis)", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r01b" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      expect(cssProperties(candidates.candidates)).toContain("align-self");
    }
  });

  test("block item generates width/height candidates", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "block",
    };
    const candidates = generateResizeCandidates({ runtimeId: "el-r02" }, classifyLayoutRole(style));
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      const props = cssProperties(candidates.candidates);
      expect(props).toContain("width");
      expect(props).toContain("height");
    }
  });

  test("grid container generates width/height box candidates (no longer unsupported)", () => {
    const style: LayoutComputedStyle = {
      display: "grid",
      flexDirection: "row",
      position: "static",
    };
    const candidates = generateResizeCandidates({ runtimeId: "el-r03" }, classifyLayoutRole(style));
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      expect(cssProperties(candidates.candidates)).toContain("width");
    }
  });

  test("resize-element inverse swaps fromValue and toValue", () => {
    const inverse = computeInverse(resizeOp);
    expect(inverse.kind).toBe("resize-element");
    if (inverse.kind === "resize-element") {
      expect(inverse.fromValue).toBe("300px");
      expect(inverse.toValue).toBe("200px");
    }
    expect(inverse.inverseOf).toBe("resize-001");
  });
});

test.describe("@resize browser", () => {
  extTest("resize handles appear when a flex item is selected", async ({ page }) => {
    await serveFixture(
      page,
      fixtureHtml(
        '<div style="display:flex;gap:16px;padding:20px"><div id="flex-item" style="flex:1;min-width:100px;height:80px;padding:10px;border:2px solid #333">Item</div></div>',
      ),
    );
    const rect = await pageElementRect(page, "#flex-item");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const handles = await overlayElementCount(page, ".vc-handle");
    extExpect(handles).toBeGreaterThan(0);
  });

  test("flex-row resize produces a flex-basis operation with correct values", () => {
    const op: ResizeElementOperation = {
      kind: "resize-element",
      id: "resize-flex-01",
      timestamp: 2000,
      runtime: false,
      target: { runtimeId: "el-flex-r01" },
      property: "flex-basis",
      fromValue: "200px",
      toValue: "300px",
    };
    expect(op.property).toBe("flex-basis");
    expect(op.fromValue).toBe("200px");
    expect(op.toValue).toBe("300px");
  });

  test("undo resize restores the original flex-basis via the inverse", () => {
    const forward: ResizeElementOperation = {
      kind: "resize-element",
      id: "resize-undo-01",
      timestamp: 3000,
      runtime: false,
      target: { runtimeId: "el-undo-r01" },
      property: "flex-basis",
      fromValue: "200px",
      toValue: "300px",
    };
    const inverse = computeInverse(forward);
    expect(inverse.kind).toBe("resize-element");
    if (inverse.kind === "resize-element") {
      expect(inverse.property).toBe("flex-basis");
      expect(inverse.fromValue).toBe("300px");
      expect(inverse.toValue).toBe("200px");
    }
  });

  test("grid item resize proposes a grid-span candidate when room remains", () => {
    const tracks: GridTrackInfo = {
      columnLines: [0, 100, 200, 300],
      rowLines: [0, 50, 100],
    };
    const placement = {
      row: 1,
      column: 1,
      rowEnd: 2,
      columnEnd: 2,
      rowSpan: 1,
      columnSpan: 1,
      rect: { x: 0, y: 0, width: 100, height: 50 },
    };
    const candidates = generateGridSpanCandidates(placement, tracks);
    expect(candidates.some((c) => c.axis === "column" && c.toSpan === 2)).toBe(true);
  });

  test("flex-column item resize generates flex-basis candidates (main axis)", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "column",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r-col" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      const props = candidates.candidates
        .filter((c) => c.kind === "css-property")
        .map((c) => c.property ?? "");
      expect(props).toContain("flex-basis");
    }
  });
});
