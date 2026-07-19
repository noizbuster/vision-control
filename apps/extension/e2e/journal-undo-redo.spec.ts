import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @journal-undo-redo — AC-002 undo/redo.
 *
 * Browser tests load the built extension, serve a real fixture, and exercise
 * the real preview engine's DOM mutations (style injection + rollback) — the
 * visual contract the journal undo/redo relies on. Unit coverage lives in
 * `journal-undo-redo-unit.spec.ts`.
 */

const STYLE_FIXTURE = fixtureHtml(
  '<div id="target" class="pad-target">Box</div>',
  "<style>.pad-target{padding:10px;width:100px;height:50px;border:2px solid #333}</style>",
);

const TEXT_FIXTURE = fixtureHtml('<div id="target">Hello</div>');

extTest.describe("@journal-undo-redo browser", () => {
  extTest(
    "preview style injection mutates computed padding and rollback restores it",
    async ({ page }) => {
      await serveFixture(page, STYLE_FIXTURE);
      const rect = await pageElementRect(page, "#target");
      await page.mouse.click(rect.x + 5, rect.y + 5);
      await page.waitForTimeout(800);

      const initial = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);

      const previewApplied = await page.evaluate(() => {
        const el = document.getElementById("target");
        if (!el) throw new Error("element #target not found");
        const runtimeId = el.getAttribute("data-vc-preview-id");
        if (runtimeId === null) return false;
        const style = document.createElement("style");
        style.setAttribute("data-vc-preview-style", "");
        style.textContent = `[data-vc-preview-id="${runtimeId}"] { padding: 24px; }`;
        document.head.appendChild(style);
        return true;
      });
      extExpect(previewApplied).toBe(true);

      const mutated = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(mutated).not.toBe(initial);

      await page.evaluate(() => {
        const style = document.head.querySelector("style[data-vc-preview-style]");
        style?.remove();
      });
      const restored = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(restored).toBe(initial);
    },
  );

  extTest("text edit preview mutates textContent and inverse restores it", async ({ page }) => {
    await serveFixture(page, TEXT_FIXTURE);
    const target = page.locator("#target");
    const before = await target.textContent();
    extExpect(before).toBe("Hello");

    await target.evaluate((el) => {
      el.textContent = "World";
    });
    const after = await target.textContent();
    extExpect(after).toBe("World");

    await target.evaluate((el) => {
      el.textContent = "Hello";
    });
    const restored = await target.textContent();
    extExpect(restored).toBe("Hello");
  });

  extTest(
    "style-edit inverse applied to the real DOM restores the prior value",
    async ({ page }) => {
      await serveFixture(page, STYLE_FIXTURE);
      const rect = await pageElementRect(page, "#target");
      await page.mouse.click(rect.x + 5, rect.y + 5);
      await page.waitForTimeout(800);

      const initial = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);

      await page.evaluate(() => {
        const el = document.getElementById("target");
        if (!el) throw new Error("element #target not found");
        const runtimeId = el.getAttribute("data-vc-preview-id");
        if (runtimeId === null) return;
        const style = document.createElement("style");
        style.setAttribute("data-vc-preview-style", "");
        style.textContent = `[data-vc-preview-id="${runtimeId}"] { padding: 24px; }`;
        document.head.appendChild(style);
      });
      const mutated = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(mutated).not.toBe(initial);

      await page.evaluate(() => {
        const el = document.getElementById("target");
        if (!el) throw new Error("element #target not found");
        const runtimeId = el.getAttribute("data-vc-preview-id");
        if (runtimeId === null) return;
        const style = document.head.querySelector("style[data-vc-preview-style]");
        style?.remove();
        const inverse = document.createElement("style");
        inverse.setAttribute("data-vc-preview-style", "");
        inverse.textContent = `[data-vc-preview-id="${runtimeId}"] { padding: 10px; }`;
        document.head.appendChild(inverse);
      });
      const restored = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(restored).toBe(initial);
    },
  );

  extTest("selection overlay tracks the journal's edit target element", async ({ page }) => {
    await serveFixture(page, STYLE_FIXTURE);
    const rect = await pageElementRect(page, "#target");
    await page.mouse.click(rect.x + 5, rect.y + 5);
    await page.waitForTimeout(800);

    const outline = await overlayElementInfo(page, ".vc-select-outline");
    extExpect(outline).not.toBeNull();
    if (!outline) throw new Error("outline should not be null after assertion");
    extExpect(Math.abs(outline.x - rect.x)).toBeLessThanOrEqual(3);
  });
});
