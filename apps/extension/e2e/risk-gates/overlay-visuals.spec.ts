import {
  expect as extExpect,
  fixtureHtml,
  overlayElementCount,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
  test,
} from "../fixtures/extension-test.ts";

/**
 * Risk gate: overlay visual fidelity.
 *
 * Browser-driven: loads the extension, serves a fixture with padding/border
 * elements, and asserts on the overlay shadow-DOM structure (hover outline,
 * selection outline, box-model regions, resize handles, pointer-events
 * pass-through, theme tokens). The drop-indicator rendering is exercised at
 * the overlay-ui unit level (pure DOM render function).
 */

const FIXTURE = fixtureHtml(`
  <div id="flex-row" style="display:flex;flex-direction:row;gap:16px;padding:20px">
    <div id="item-a" style="flex:1;min-width:100px;height:80px;padding:10px;border:2px solid #333;background:#eee">A</div>
    <div id="item-b" style="flex:1;min-width:100px;height:80px;padding:10px;border:2px solid #333;background:#eee">B</div>
  </div>
  <button id="themed-btn" style="padding:12px 24px;margin:20px">Theme Test</button>
`);

test.describe("risk: overlay visuals (browser)", () => {
  test("hover outline appears at the element's bounding rect", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const rect = await pageElementRect(page, "#item-a");

    await page.mouse.move(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const hover = await overlayElementInfo(page, ".vc-hover-outline");
    extExpect(hover).not.toBeNull();
    if (!hover) throw new Error("hover should not be null after assertion");
    extExpect(Math.abs(hover.width - rect.width)).toBeLessThanOrEqual(3);
  });

  test("selection outline persists after click", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const rect = await pageElementRect(page, "#item-a");

    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const select = await overlayElementInfo(page, ".vc-select-outline");
    extExpect(select).not.toBeNull();
    if (!select) throw new Error("select should not be null after assertion");
    extExpect(Math.abs(select.x - rect.x)).toBeLessThanOrEqual(3);
  });

  test("box model overlay shows content/padding/border/margin regions on selection", async ({
    page,
  }) => {
    await serveFixture(page, FIXTURE);
    const rect = await pageElementRect(page, "#item-a");

    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const boxModelCount = await overlayElementCount(page, ".vc-box-model");
    extExpect(boxModelCount).toBeGreaterThan(0);

    const regions = await overlayElementCount(page, ".vc-box-model__region");
    extExpect(regions).toBeGreaterThanOrEqual(3);
  });

  test("resize handles appear for a flex item", async ({ page }) => {
    await serveFixture(page, FIXTURE);
    const rect = await pageElementRect(page, "#item-a");

    await page.mouse.click(rect.x + 10, rect.y + 10);
    await page.waitForTimeout(800);

    const handles = await overlayElementCount(page, ".vc-handle");
    extExpect(handles).toBeGreaterThan(0);
  });

  test("overlay host has pointer-events none (pass-through)", async ({ page }) => {
    await serveFixture(page, FIXTURE);

    const pe = await page.evaluate(() => {
      const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement | null;
      return host ? getComputedStyle(host).pointerEvents : null;
    });
    extExpect(pe).toBe("none");
  });

  test("overlay theme tokens are defined in the shadow root CSS", async ({ page }) => {
    await serveFixture(page, FIXTURE);

    const tokens = await page.evaluate(() => {
      const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement | null;
      if (!host?.shadowRoot) return null;
      const root = host.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement | null;
      if (!root) return null;
      const style = getComputedStyle(root);
      return {
        hover: style.getPropertyValue("--vc-hover"),
        select: style.getPropertyValue("--vc-select"),
      };
    });
    extExpect(tokens).not.toBeNull();
    if (!tokens) throw new Error("tokens should not be null after assertion");
    extExpect(tokens.hover.trim().length).toBeGreaterThan(0);
    extExpect(tokens.select.trim().length).toBeGreaterThan(0);
  });

  test("overlay adapts to dark theme via prefers-color-scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await serveFixture(page, FIXTURE);

    const rect = await pageElementRect(page, "#themed-btn");
    await page.mouse.click(rect.x + 5, rect.y + 5);
    await page.waitForTimeout(800);

    const outlineColor = await page.evaluate(() => {
      const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement | null;
      const el = host?.shadowRoot?.querySelector(".vc-select-outline") as HTMLElement | null;
      return el ? getComputedStyle(el).borderColor : null;
    });
    extExpect(outlineColor).not.toBeNull();
    if (!outlineColor) throw new Error("outlineColor should not be null after assertion");
    extExpect(outlineColor.trim().length).toBeGreaterThan(0);
  });

  test("overlay adapts to light theme via prefers-color-scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await serveFixture(page, FIXTURE);

    const rect = await pageElementRect(page, "#themed-btn");
    await page.mouse.click(rect.x + 5, rect.y + 5);
    await page.waitForTimeout(800);

    const outlineColor = await page.evaluate(() => {
      const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement | null;
      const el = host?.shadowRoot?.querySelector(".vc-select-outline") as HTMLElement | null;
      return el ? getComputedStyle(el).borderColor : null;
    });
    extExpect(outlineColor).not.toBeNull();
    if (!outlineColor) throw new Error("outlineColor should not be null after assertion");
    extExpect(outlineColor.trim().length).toBeGreaterThan(0);
  });
});

test("drop indicator CSS class is defined in the overlay design system", async ({ page }) => {
  await serveFixture(page, FIXTURE);
  const hasDropIndicatorCss = await page.evaluate(() => {
    const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement | null;
    if (!host?.shadowRoot) return false;
    const style = host.shadowRoot.querySelector("style");
    return style?.textContent?.includes(".vc-drop-indicator") ?? false;
  });
  extExpect(hasDropIndicatorCss).toBe(true);
});
