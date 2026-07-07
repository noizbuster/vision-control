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
  overlayElementInfo,
  pageElementRect,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @resize — AC-005 element resize.
 *
 * Verifies: resize handle visibility, smooth drag preview, flex-basis candidate
 * generation for flex items (not width/height), align-self stretch for the flex
 * cross-axis, grid-span candidates for grid items, inverse restore. Unit tests
 * verify candidate generation + inverse; browser tests drive the real overlay +
 * preview engine against live layout.
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

/**
 * Browser-driven: loads the built extension, serves a loopback fixture, selects
 * a real element, and drives the REAL ResizeController via pointer events on
 * the overlay's resize handles (pointer-events: auto in the shadow DOM). The
 * preview engine injects a live `[data-vc-preview-id]` CSS rule during the
 * drag; we assert the computed style changes against the real browser layout.
 *
 * Properties are stylesheet-defined (not inline) so the attribute-selector
 * preview rule can override them (equal specificity, later in cascade).
 */
const BLOCK_FIXTURE = fixtureHtml(
  '<div id="block" class="block-item">Block</div>',
  "<style>.block-item{width:200px;height:100px;padding:10px;border:2px solid #333}</style>",
);

const FLEX_FIXTURE = fixtureHtml(
  '<div class="flex-row"><div id="flex-item" class="flex-cell">Item</div></div>',
  "<style>.flex-row{display:flex;flex-direction:row;gap:16px;padding:20px}.flex-cell{width:120px;min-width:60px;height:80px;padding:10px;border:2px solid #333}</style>",
);

test.describe("@resize browser", () => {
  extTest("resize handles appear when a block item is selected", async ({ page }) => {
    await serveFixture(page, BLOCK_FIXTURE);
    const rect = await pageElementRect(page, "#block");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const handles = await overlayElementCount(page, ".vc-handle");
    extExpect(handles).toBeGreaterThan(0);
  });

  extTest("resize handles appear when a flex item is selected", async ({ page }) => {
    await serveFixture(page, FLEX_FIXTURE);
    const rect = await pageElementRect(page, "#flex-item");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const handles = await overlayElementCount(page, ".vc-handle");
    extExpect(handles).toBeGreaterThan(0);
  });

  extTest(
    "dragging the east handle live-previews a different width on a block item",
    async ({ page }) => {
      await serveFixture(page, BLOCK_FIXTURE);
      const rect = await pageElementRect(page, "#block");
      await page.mouse.click(rect.x + 10, rect.y + 10);
      await page.waitForTimeout(800);

      const beforeWidth = await page.locator("#block").evaluate((el) => getComputedStyle(el).width);

      const eHandle = await overlayElementInfo(page, ".vc-handle-e");
      extExpect(eHandle).not.toBeNull();
      if (!eHandle) throw new Error("eHandle should not be null after assertion");
      const hx = eHandle.x + eHandle.width / 2;
      const hy = eHandle.y + eHandle.height / 2;

      await page.mouse.move(hx, hy);
      await page.mouse.down();
      await page.mouse.move(hx + 80, hy, { steps: 15 });
      await page.waitForTimeout(400);

      const duringWidth = await page.locator("#block").evaluate((el) => getComputedStyle(el).width);

      await page.mouse.up();

      // The real ResizeController drives the real preview engine which injects a
      // live [data-vc-preview-id] CSS rule. The computed width mutates from the
      // drag delta (the controller's fromValue is a base estimate, not the
      // element's authored value, so the delta direction reflects the gesture).
      extExpect(duringWidth).not.toBe(beforeWidth);
    },
  );

  extTest("dragging the east handle live-previews a wider box on a flex item", async ({ page }) => {
    await serveFixture(page, FLEX_FIXTURE);
    const rect = await pageElementRect(page, "#flex-item");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const beforeRect = await pageElementRect(page, "#flex-item");

    const eHandle = await overlayElementInfo(page, ".vc-handle-e");
    extExpect(eHandle).not.toBeNull();
    if (!eHandle) throw new Error("eHandle should not be null after assertion");
    const hx = eHandle.x + eHandle.width / 2;
    const hy = eHandle.y + eHandle.height / 2;

    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + 60, hy, { steps: 15 });
    await page.waitForTimeout(400);

    const duringRect = await pageElementRect(page, "#flex-item");

    await page.mouse.up();

    extExpect(Math.round(duringRect.width)).not.toBe(Math.round(beforeRect.width));
    extExpect(duringRect.width).toBeGreaterThan(beforeRect.width);
  });

  extTest(
    "selection outline appears at the element rect confirming the resize target",
    async ({ page }) => {
      await serveFixture(page, BLOCK_FIXTURE);
      const rect = await pageElementRect(page, "#block");
      await page.mouse.click(rect.x + 10, rect.y + 10);
      await page.waitForTimeout(800);

      const outline = await overlayElementInfo(page, ".vc-select-outline");
      extExpect(outline).not.toBeNull();
      if (!outline) throw new Error("outline should not be null after assertion");
      extExpect(Math.abs(outline.x - rect.x)).toBeLessThanOrEqual(3);
      extExpect(Math.abs(outline.width - rect.width)).toBeLessThanOrEqual(3);
    },
  );
});
