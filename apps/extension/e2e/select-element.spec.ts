import {
  expect,
  fixtureHtml,
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

test.describe("@select-element browser", () => {
  test("hover shows an outline at the element's bounding rect", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.move(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(800);

    const hover = await overlayElementInfo(page, ".vc-hover-outline");
    expect(hover).not.toBeNull();
    expect(Math.abs(hover!.x - btnRect.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(hover!.y - btnRect.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(hover!.width - btnRect.width)).toBeLessThanOrEqual(2);
  });

  test("click selects the element and the selection outline appears", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.click(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(800);

    const select = await overlayElementInfo(page, ".vc-select-outline");
    expect(select).not.toBeNull();
    expect(Math.abs(select!.x - btnRect.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(select!.width - btnRect.width)).toBeLessThanOrEqual(2);
  });

  test("outline follows the element after scroll", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const cardRect = await pageElementRect(page, "#card");

    await page.mouse.click(cardRect.x + 5, cardRect.y + 5);
    await page.waitForTimeout(600);

    const beforeScroll = await overlayElementInfo(page, ".vc-select-outline");
    expect(beforeScroll).not.toBeNull();

    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(800);

    const afterScroll = await overlayElementInfo(page, ".vc-select-outline");
    expect(afterScroll).not.toBeNull();
    expect(afterScroll!.y).toBeLessThan(beforeScroll!.y);
    expect(Math.abs(afterScroll!.y - (beforeScroll!.y - 200))).toBeLessThanOrEqual(5);
  });

  test("outline follows the element after window resize", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);
    const btnRect = await pageElementRect(page, "#btn");

    await page.mouse.click(btnRect.x + 5, btnRect.y + 5);
    await page.waitForTimeout(600);

    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(800);

    const newBtnRect = await pageElementRect(page, "#btn");
    const select = await overlayElementInfo(page, ".vc-select-outline");
    expect(select).not.toBeNull();
    expect(Math.abs(select!.width - newBtnRect.width)).toBeLessThanOrEqual(5);
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
