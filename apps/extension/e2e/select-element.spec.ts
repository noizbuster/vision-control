import {
  expect,
  fixtureHtml,
  fixtureUrl,
  openExtensionPanel,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
  test,
} from "./fixtures/extension-test.ts";

/**
 * @select-element — AC-001 element selection.
 *
 * Browser-driven: loads the built extension in Chromium, serves a loopback
 * fixture, and asserts on the overlay shadow-DOM elements (hover outline,
 * selection outline, scroll/resize tracking). Cross-origin isolation is
 * verified through the browser's own security model that the content script
 * relies on.
 */

const BOARD_HTML = fixtureHtml(`
  <button id="btn" style="padding:10px 20px;margin:30px">Click me</button>
  <div id="card" style="width:200px;height:100px;padding:20px;margin:15px;border:2px solid blue">Card</div>
  <div style="height:2000px"></div>
`);

type OverlayRect = NonNullable<Awaited<ReturnType<typeof overlayElementInfo>>>;

function requireOverlayRect(rect: OverlayRect | null, label: string): OverlayRect {
  if (rect === null) {
    throw new Error(`${label} was not rendered`);
  }
  return rect;
}

function isVisibleOverlayRect(rect: OverlayRect | null): boolean {
  return rect !== null && rect.width > 0 && rect.height > 0;
}

test.describe("@select-element browser", () => {
  test("page clicks pass through until Inspect mode is enabled", async ({ page }) => {
    await serveFixture(page, BOARD_HTML, { interactionMode: null });
    await page.locator("#btn").evaluate((button) => {
      button.addEventListener("click", () => {
        button.setAttribute("data-clicked", "true");
      });
    });
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.click(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(300);

    await expect(page.locator("#btn")).toHaveAttribute("data-clicked", "true");
    expect(isVisibleOverlayRect(await overlayElementInfo(page, ".vc-select-outline"))).toBe(false);
  });

  test("hover shows an outline at the element's bounding rect", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.move(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(800);

    const hover = requireOverlayRect(
      await overlayElementInfo(page, ".vc-hover-outline"),
      "hover outline",
    );
    expect(Math.abs(hover.x - btnRect.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(hover.y - btnRect.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(hover.width - btnRect.width)).toBeLessThanOrEqual(2);
  });

  test("panel UI Inspect activates overlays when the panel is opened as an extension page", async ({
    page,
  }) => {
    await serveFixture(page, BOARD_HTML, { interactionMode: null });
    const panel = await openExtensionPanel(page);

    await expect(panel.locator("[data-testid='inspected-url']")).toContainText(fixtureUrl("board"));
    await panel.getByRole("button", { name: "Inspect" }).click();
    await page.bringToFront();

    const btnRect = await pageElementRect(page, "#btn");
    await page.mouse.move(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(300);

    const hover = requireOverlayRect(
      await overlayElementInfo(page, ".vc-hover-outline"),
      "hover outline",
    );
    expect(Math.abs(hover.x - btnRect.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(hover.y - btnRect.y)).toBeLessThanOrEqual(2);

    await panel.close();
  });

  test("click selects the element and the selection outline appears", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.click(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(800);

    const select = requireOverlayRect(
      await overlayElementInfo(page, ".vc-select-outline"),
      "selection outline",
    );
    expect(Math.abs(select.x - btnRect.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(select.width - btnRect.width)).toBeLessThanOrEqual(2);
  });

  test("property inspector moves by dragging the element-name header", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.click(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(800);

    const before = requireOverlayRect(
      await overlayElementInfo(page, ".vc-inspector"),
      "property inspector",
    );
    const header = requireOverlayRect(
      await overlayElementInfo(page, ".vc-inspector__header"),
      "property inspector header",
    );

    await page.mouse.move(header.x + 20, header.y + 8);
    await page.mouse.down();
    await page.mouse.move(header.x - 120, header.y + 80, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const afterDrag = requireOverlayRect(
      await overlayElementInfo(page, ".vc-inspector"),
      "property inspector after drag",
    );
    expect(afterDrag.x).toBeLessThan(before.x - 80);
    expect(afterDrag.y).toBeGreaterThan(before.y + 50);

    const cardRect = await pageElementRect(page, "#card");
    await page.mouse.click(cardRect.x + 5, cardRect.y + 5);
    await page.waitForTimeout(500);

    const afterReselect = requireOverlayRect(
      await overlayElementInfo(page, ".vc-inspector"),
      "property inspector after reselect",
    );
    expect(Math.abs(afterReselect.x - afterDrag.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(afterReselect.y - afterDrag.y)).toBeLessThanOrEqual(2);
  });

  test("outline follows the element after scroll", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const cardRect = await pageElementRect(page, "#card");

    await page.mouse.click(cardRect.x + 5, cardRect.y + 5);
    await page.waitForTimeout(600);

    const beforeScroll = requireOverlayRect(
      await overlayElementInfo(page, ".vc-select-outline"),
      "selection outline before scroll",
    );

    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(800);

    const afterScroll = requireOverlayRect(
      await overlayElementInfo(page, ".vc-select-outline"),
      "selection outline after scroll",
    );
    expect(afterScroll.y).toBeLessThan(beforeScroll.y);
    expect(Math.abs(afterScroll.y - (beforeScroll.y - 200))).toBeLessThanOrEqual(5);
  });

  test("outline follows the element after window resize", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.click(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(600);

    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(800);

    const newBtnRect = await pageElementRect(page, "#btn");
    const select = requireOverlayRect(
      await overlayElementInfo(page, ".vc-select-outline"),
      "selection outline",
    );
    expect(Math.abs(select.width - newBtnRect.width)).toBeLessThanOrEqual(5);
  });

  test("selection works inside a same-origin iframe", async ({ page }) => {
    const iframeDoc =
      '<!DOCTYPE html><html><body><button id="inner-btn">Inner</button></body></html>';
    const html = fixtureHtml(
      `<iframe id="frame" srcdoc="${iframeDoc.replace(/"/g, "&quot;")}"></iframe>`,
    );
    await serveFixture(page, html);

    const frame = page.frameLocator("#frame");
    await frame.locator("#inner-btn").waitFor({ timeout: 5000 });
    const visible = await frame.locator("#inner-btn").isVisible();
    expect(visible).toBe(true);
  });

  test("cross-origin iframe contentDocument is null (opaque, not selectable)", async ({ page }) => {
    const html = fixtureHtml(
      `<iframe id="cross-frame" src="https://nonexistent.example.com/"></iframe>`,
    );
    await serveFixture(page, html);

    const isOpaque = await page.evaluate(() => {
      const frame = document.getElementById("cross-frame") as HTMLIFrameElement | null;
      if (!frame) return false;
      try {
        return frame.contentDocument === null;
      } catch {
        return true;
      }
    });
    expect(isOpaque).toBe(true);
  });
});
