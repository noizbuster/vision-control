import { expect, test } from "@playwright/test";

import { computeInverse, type ReorderChildOperation } from "@vision-control/change-ir";
import { computeInsertionIndex } from "@vision-control/layout-engine";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
  setInteractionMode,
} from "./fixtures/extension-test.ts";

/**
 * @reorder — AC-003 Flex/container reorder.
 *
 * Unit tests verify insertion index math + inverse computation against
 * synthetic fixtures. Browser tests load the built extension, serve a real
 * flex fixture, select real children via the overlay, and run
 * `computeInsertionIndex` against REAL browser-computed rects (the same
 * geometry pipeline the ReorderController uses) — proving the insertion logic
 * is correct against the live layout engine, not just synthetic data.
 */

const reorderOp: ReorderChildOperation = {
  kind: "reorder-child",
  id: "reorder-001",
  timestamp: 1000,
  runtime: false,
  origin: "canvas-drag",
  confidence: 1,
  parent: { runtimeId: "parent-r01" },
  child: { runtimeId: "child-r01" },
  fromIndex: 2,
  toIndex: 0,
};

const applyReorder = <T>(arr: readonly T[], from: number, to: number): T[] => {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
};

test.describe("@reorder unit", () => {
  test("insertion index for vertical flex splits at midpoint boundary", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 100, height: 50 } },
      { rect: { x: 0, y: 50, width: 100, height: 50 } },
      { rect: { x: 0, y: 100, width: 100, height: 50 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-r01", tagName: "div" },
      children,
      50,
      75,
      "flex-container",
      "column",
    );
    expect(result.index).toBe(1);
  });

  test("reorder-child inverse swaps fromIndex and toIndex", () => {
    const inverse = computeInverse(reorderOp);
    expect(inverse.kind).toBe("reorder-child");
    if (inverse.kind === "reorder-child") {
      expect(inverse.fromIndex).toBe(0);
      expect(inverse.toIndex).toBe(2);
    }
    expect(inverse.inverseOf).toBe("reorder-001");
  });

  test("applying reorder then its inverse restores original array order", () => {
    const original = ["a", "b", "c", "d", "e"];
    const forward = applyReorder(original, 2, 0);
    expect(forward).toEqual(["c", "a", "b", "d", "e"]);
    const restored = applyReorder(forward, 0, 2);
    expect(restored).toEqual(original);
  });

  test("runtime flag is preserved on inverse (preview undo stays preview)", () => {
    const previewReorder: ReorderChildOperation = {
      ...reorderOp,
      id: "reorder-pre",
      runtime: true,
    };
    const inverse = computeInverse(previewReorder);
    expect(inverse.runtime).toBe(true);
  });

  test("flex-column drag computes insertion index at midpoint boundary", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 100, height: 50 } },
      { rect: { x: 0, y: 50, width: 100, height: 50 } },
      { rect: { x: 0, y: 100, width: 100, height: 50 } },
      { rect: { x: 0, y: 150, width: 100, height: 50 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-r02", tagName: "div" },
      children,
      50,
      125,
      "flex-container",
      "column",
    );
    expect(result.index).toBe(2);
  });

  test("flex-row drag computes horizontal insertion index", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 100, height: 50 } },
      { rect: { x: 100, y: 0, width: 100, height: 50 } },
      { rect: { x: 200, y: 0, width: 100, height: 50 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-r03", tagName: "div" },
      children,
      200,
      25,
      "flex-container",
      "row",
    );
    expect(result.index).toBe(2);
  });

  test("reorder-child operation is distinct from reparent-element (same parent)", () => {
    const reorderResult = computeInverse(reorderOp);
    expect(reorderResult.kind).toBe("reorder-child");
    expect(reorderResult.kind).not.toBe("reparent-element");
  });

  test("block-flow reorder computes insertion index without flex assumptions", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 200, height: 30 } },
      { rect: { x: 0, y: 30, width: 200, height: 30 } },
      { rect: { x: 0, y: 60, width: 200, height: 30 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-block", tagName: "div" },
      children,
      200,
      45,
      "normal-flow-block",
      "column",
    );
    expect(result.index).toBe(1);
  });
});

const FLEX_ROW_FIXTURE = fixtureHtml(
  '<div id="row" class="row"><div id="a" class="cell">A</div><div id="b" class="cell">B</div><div id="c" class="cell">C</div></div>',
  "<style>.row{display:flex;flex-direction:row;gap:16px;padding:20px}.cell{width:100px;height:50px;padding:10px;border:2px solid #333}</style>",
);

const FLEX_COL_FIXTURE = fixtureHtml(
  '<div id="col" class="col"><div id="x" class="cell">X</div><div id="y" class="cell">Y</div><div id="z" class="cell">Z</div></div>',
  "<style>.col{display:flex;flex-direction:column;gap:12px;padding:20px}.cell{width:100px;height:50px;padding:10px;border:2px solid #333}</style>",
);

test.describe("@reorder browser", () => {
  extTest("flex-row selection shows overlay outline on the clicked child", async ({ page }) => {
    await serveFixture(page, FLEX_ROW_FIXTURE);
    const bRect = await pageElementRect(page, "#b");
    await page.mouse.click(bRect.x + 10, bRect.y + 10);
    await page.waitForTimeout(800);

    const outline = await overlayElementInfo(page, ".vc-select-outline");
    extExpect(outline).not.toBeNull();
    if (!outline) throw new Error("outline should not be null after assertion");
    extExpect(Math.abs(outline.x - bRect.x)).toBeLessThanOrEqual(3);
    extExpect(Math.abs(outline.width - bRect.width)).toBeLessThanOrEqual(3);
  });

  extTest(
    "flex-row insertion index from real browser rects matches the second gap",
    async ({ page }) => {
      await serveFixture(page, FLEX_ROW_FIXTURE);
      const children = await page.locator("#row").evaluate((parent) => {
        const rects = Array.from(parent.children).map((child) => {
          const r = child.getBoundingClientRect();
          return { rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
        });
        const parentStyle = getComputedStyle(parent);
        return { rects, flexDirection: parentStyle.flexDirection, display: parentStyle.display };
      });

      const rect0 = children.rects[0];
      const rect1 = children.rects[1];
      const rect2 = children.rects[2];
      if (!rect0 || !rect1 || !rect2) throw new Error("expected at least 3 rects");

      const gapBetweenBandC =
        rect1.rect.x + rect1.rect.width + (rect2.rect.x - (rect1.rect.x + rect1.rect.width)) / 2;

      const result = computeInsertionIndex(
        { runtimeId: "row", tagName: "div" },
        children.rects,
        gapBetweenBandC,
        rect0.rect.y + 10,
        "flex-container",
        children.flexDirection as "row",
      );

      extExpect(result.index).toBe(2);
    },
  );

  extTest(
    "flex-column insertion index from real browser rects matches the first gap",
    async ({ page }) => {
      await serveFixture(page, FLEX_COL_FIXTURE);
      const children = await page.locator("#col").evaluate((parent) => {
        const rects = Array.from(parent.children).map((child) => {
          const r = child.getBoundingClientRect();
          return { rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
        });
        return { rects };
      });

      const rect0 = children.rects[0];
      const rect1 = children.rects[1];
      if (!rect0 || !rect1) throw new Error("expected at least 2 rects");

      const midpointBetweenXandY =
        rect0.rect.y + rect0.rect.height + (rect1.rect.y - (rect0.rect.y + rect0.rect.height)) / 2;

      const result = computeInsertionIndex(
        { runtimeId: "col", tagName: "div" },
        children.rects,
        rect0.rect.x + 10,
        midpointBetweenXandY,
        "flex-container",
        "column",
      );

      extExpect(result.index).toBe(1);
    },
  );

  extTest(
    "selecting a flex child stamps a data-vc-preview-id for reorder identity",
    async ({ page }) => {
      await serveFixture(page, FLEX_ROW_FIXTURE);
      const aRect = await pageElementRect(page, "#a");
      await page.mouse.click(aRect.x + 10, aRect.y + 10);
      await page.waitForTimeout(800);

      const previewId = await page
        .locator("#a")
        .evaluate((el) => el.getAttribute("data-vc-preview-id"));
      extExpect(previewId).not.toBeNull();
      if (!previewId) throw new Error("previewId should not be null after assertion");
      extExpect(previewId.length).toBeGreaterThan(0);
    },
  );

  extTest(
    "Move reorder keeps DOM order stable while held, then applies at the displayed boundary",
    async ({ page }) => {
      await serveFixture(page, FLEX_ROW_FIXTURE);
      const aRect = await pageElementRect(page, "#a");
      await page.mouse.click(aRect.x + 10, aRect.y + 10);
      await extExpect(page.locator("#a")).toHaveAttribute("data-vc-preview-id", /.+/);
      await setInteractionMode(page, "Move");

      const cRect = await pageElementRect(page, "#c");
      await page.mouse.move(aRect.x + aRect.width / 2, aRect.y + aRect.height / 2);
      await page.mouse.down();
      await page.mouse.move(cRect.x + cRect.width - 4, cRect.y + cRect.height / 2, { steps: 8 });

      const heldChildIds = await page
        .locator("#row")
        .evaluate((parent) => Array.from(parent.children).map((child) => child.id));
      extExpect(heldChildIds).toEqual(["a", "b", "c"]);

      const dropIndicator = await page.evaluate(() => {
        const host = document.querySelector("[data-vc-overlay-host]");
        const indicator = Array.from(
          host?.shadowRoot?.querySelectorAll<HTMLElement>(".vc-drop-indicator") ?? [],
        ).find((element) => getComputedStyle(element).display === "block");
        if (indicator === undefined) return null;
        const rect = indicator.getBoundingClientRect();
        return {
          display: getComputedStyle(indicator).display,
          orientation: indicator.getAttribute("data-orientation"),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      });
      extExpect(dropIndicator).not.toBeNull();
      if (dropIndicator === null) throw new Error("drop indicator was not visible during reorder");
      extExpect(dropIndicator.display).toBe("block");
      extExpect(dropIndicator.orientation).toBe("vertical");
      extExpect(Math.abs(dropIndicator.x - (cRect.x + cRect.width))).toBeLessThanOrEqual(2);
      extExpect(dropIndicator.height).toBeGreaterThan(0);

      await page.mouse.up();

      await extExpect
        .poll(() =>
          page
            .locator("#row")
            .evaluate((parent) => Array.from(parent.children).map((child) => child.id)),
        )
        .toEqual(["b", "c", "a"]);
      await extExpect
        .poll(() =>
          page.evaluate(() =>
            Array.from(
              document
                .querySelector("[data-vc-overlay-host]")
                ?.shadowRoot?.querySelectorAll<HTMLElement>(".vc-drop-indicator") ?? [],
            ).every((element) => getComputedStyle(element).display === "none"),
          ),
        )
        .toBe(true);
      await extExpect
        .poll(async () => {
          const movedRect = await pageElementRect(page, "#a");
          const selectionOutline = await overlayElementInfo(page, ".vc-select-outline");
          return selectionOutline === null
            ? Number.POSITIVE_INFINITY
            : Math.abs(selectionOutline.x - movedRect.x);
        })
        .toBeLessThanOrEqual(3);
    },
  );
});
