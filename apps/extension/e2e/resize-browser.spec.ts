import {
  expect,
  fixtureHtml,
  openExtensionPanel,
  overlayElementCount,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
  test,
} from "./fixtures/extension-test.ts";

const BLOCK_FIXTURE = fixtureHtml(
  '<div id="block" class="block-item">Block</div>',
  "<style>.block-item{width:200px;height:100px;padding:10px;border:2px solid #333}</style>",
);

const FLEX_FIXTURE = fixtureHtml(
  '<div class="flex-row"><div id="flex-item" class="flex-cell">Item</div></div>',
  "<style>.flex-row{display:flex;flex-direction:row;gap:16px;padding:20px}.flex-cell{width:120px;min-width:60px;height:80px;padding:10px;border:2px solid #333}</style>",
);

const FLEX_PAIR_FIXTURE = fixtureHtml(
  '<div class="pair-row"><div id="primary" class="pair-cell primary"></div><div id="neighbor" class="pair-cell neighbor"></div><div id="witness" class="pair-cell witness"></div></div>',
  `<style>
    .pair-row{display:flex;flex-flow:row nowrap;width:400px;height:80px}
    .pair-cell{box-sizing:border-box;height:80px;margin:0;padding:0;border:0 solid transparent}
    .primary{box-sizing:content-box;flex:1 1 138px;min-width:50px;max-width:300px;padding:0 10px;border-width:0 1px;background:#bfd7ff}
    .neighbor{flex:2 1 140px;min-width:50px;max-width:none;background:#ffd6a5}
    .witness{flex:0 0 100px;min-width:50px;max-width:none;background:#caffbf}
  </style>`,
);

const pairState = async (page: Parameters<typeof pageElementRect>[0]) => {
  const primary = await pageElementRect(page, "#primary");
  const neighbor = await pageElementRect(page, "#neighbor");
  const flex = await page.locator(".pair-cell").evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return [style.flexGrow, style.flexShrink, style.flexBasis];
    }),
  );
  return { primary, neighbor, flex };
};

const pairFeedbackState = async (page: Parameters<typeof pageElementRect>[0]) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-vc-overlay-host]")?.shadowRoot;
    const label = root?.querySelector(".vc-flex-pair-label");
    const east = root?.querySelector(".vc-handle-e");
    return {
      label: label?.textContent ?? null,
      active: label?.classList.contains("vc-flex-pair-label--active") ?? false,
      disabled: east instanceof HTMLButtonElement ? east.disabled : null,
      captured: east instanceof HTMLElement && east.hasPointerCapture(1),
    };
  });

test.describe("@resize browser", () => {
  test("resize handles appear when a block item is selected", async ({ page }) => {
    await serveFixture(page, BLOCK_FIXTURE);
    const rect = await pageElementRect(page, "#block");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);
    expect(await overlayElementCount(page, ".vc-handle")).toBeGreaterThan(0);
  });

  test("resize handles appear when a flex item is selected", async ({ page }) => {
    await serveFixture(page, FLEX_FIXTURE);
    const rect = await pageElementRect(page, "#flex-item");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);
    expect(await overlayElementCount(page, ".vc-handle")).toBeGreaterThan(0);
  });

  test("east handle live-previews a different block width", async ({ page }) => {
    await serveFixture(page, BLOCK_FIXTURE);
    const rect = await pageElementRect(page, "#block");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);
    const beforeWidth = await page
      .locator("#block")
      .evaluate((element) => getComputedStyle(element).width);
    const handle = await overlayElementInfo(page, ".vc-handle-e");
    expect(handle).not.toBeNull();
    if (handle === null) throw new Error("east resize handle was not rendered");

    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 15 });
    await page.waitForTimeout(400);
    const duringWidth = await page
      .locator("#block")
      .evaluate((element) => getComputedStyle(element).width);
    await page.mouse.up();

    expect(duringWidth).not.toBe(beforeWidth);
  });

  test("east handle rejects a flex item without a visual neighbor", async ({ page }) => {
    await serveFixture(page, FLEX_FIXTURE);
    const rect = await pageElementRect(page, "#flex-item");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);
    const beforeRect = await pageElementRect(page, "#flex-item");
    const handle = await overlayElementInfo(page, ".vc-handle-e");
    expect(handle).not.toBeNull();
    if (handle === null) throw new Error("east resize handle was not rendered");

    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 15 });
    await page.waitForTimeout(400);
    const duringRect = await pageElementRect(page, "#flex-item");
    await page.mouse.up();

    expect(duringRect.width).toBeCloseTo(beforeRect.width, 0);
  });

  test("selection outline tracks the resize target rect", async ({ page }) => {
    await serveFixture(page, BLOCK_FIXTURE);
    const rect = await pageElementRect(page, "#block");
    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);
    const outline = await overlayElementInfo(page, ".vc-select-outline");
    expect(outline).not.toBeNull();
    if (outline === null) throw new Error("selection outline was not rendered");
    expect(Math.abs(outline.x - rect.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(outline.width - rect.width)).toBeLessThanOrEqual(3);
  });

  test("east flex-pair resize holds and retains both validated members", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await serveFixture(page, FLEX_PAIR_FIXTURE);
    const primary = await pageElementRect(page, "#primary");
    await page.mouse.click(primary.x + 10, primary.y + 10);
    await page.waitForTimeout(800);
    const before = await pairState(page);
    const handle = await overlayElementInfo(page, ".vc-handle-e");
    expect(handle).not.toBeNull();
    if (handle === null) throw new Error("east pair resize handle was not rendered");
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 10 });
    await page.waitForTimeout(100);
    const held = await pairState(page);
    expect(Math.abs(held.primary.width - before.primary.width - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(held.neighbor.width - before.neighbor.width + 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(held.primary.width + held.neighbor.width - 300)).toBeLessThanOrEqual(1);

    await page.mouse.up();
    await page.waitForTimeout(100);
    const released = await pairState(page);
    expect(released.flex[0]?.slice(0, 2)).toEqual(["0", "0"]);
    expect(released.flex[1]?.slice(0, 2)).toEqual(["0", "0"]);
    const primaryEdges = await page.locator("#primary").evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
        .map(Number.parseFloat)
        .reduce((total, value) => total + value, 0);
    });
    expect(
      Math.abs(
        Number.parseFloat(released.flex[0]?.[2] ?? "NaN") - (released.primary.width - primaryEdges),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(Number.parseFloat(released.flex[1]?.[2] ?? "NaN") - released.neighbor.width),
    ).toBeLessThanOrEqual(1);
    expect(released.primary.width).toBeCloseTo(held.primary.width, 0);
    expect(released.neighbor.width).toBeCloseTo(held.neighbor.width, 0);

    expect(consoleErrors).toEqual([]);
  });

  test("pointercancel restores both flex members without a journal operation", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await serveFixture(page, FLEX_PAIR_FIXTURE, "pair-cancel");
    const primary = await pageElementRect(page, "#primary");
    await page.mouse.click(primary.x + 10, primary.y + 10);
    await page.waitForTimeout(800);
    const before = await pairState(page);
    const handle = await overlayElementInfo(page, ".vc-handle-e");
    expect(handle).not.toBeNull();
    if (handle === null) throw new Error("east pair resize handle was not rendered");
    expect(await pairFeedbackState(page)).toEqual({
      label: "Paired resize ready",
      active: false,
      disabled: false,
      captured: false,
    });
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 10 });
    await expect
      .poll(async () => (await pairState(page)).primary.width)
      .toBeGreaterThan(before.primary.width + 39);
    const held = await pairState(page);
    expect(Math.abs(held.primary.width - before.primary.width - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(held.neighbor.width - before.neighbor.width + 40)).toBeLessThanOrEqual(1);
    expect(await pairFeedbackState(page)).toEqual({
      label: "Resizing paired items",
      active: true,
      disabled: false,
      captured: true,
    });

    await page.evaluate(() => {
      const host = document.querySelector("[data-vc-overlay-host]");
      const east = host?.shadowRoot?.querySelector(".vc-handle-e");
      east?.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }));
    });
    await expect
      .poll(async () => (await pairState(page)).primary.width)
      .toBeCloseTo(before.primary.width, 0);
    const cancelled = await pairState(page);
    expect(cancelled.primary.width).toBeCloseTo(before.primary.width, 0);
    expect(cancelled.neighbor.width).toBeCloseTo(before.neighbor.width, 0);
    expect(await pairFeedbackState(page)).toEqual({
      label: "Paired resize ready",
      active: false,
      disabled: false,
      captured: false,
    });
    await page.mouse.up();
    const panel = await openExtensionPanel(page);
    await expect(panel.locator(".journal-entry")).toHaveCount(0);
    await panel.close();
    expect(consoleErrors).toEqual([]);
  });
});
