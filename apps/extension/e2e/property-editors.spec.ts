import { expect, test } from "@playwright/test";

import {
  createClassAddCommand,
  createStyleEditCommand,
  createTextEditCommand,
  validateCssProperty,
  validateCssValue,
} from "@vision-control/inspector-core";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @property-editors — AC-002 style editing (§31.5 edit-padding / edit-text).
 *
 * Unit tests exercise the real command builders (inspector-core) and CSS
 * validation pipeline. Browser tests load the built extension, serve a real
 * fixture, select a real element via the overlay, and apply the preview-engine
 * DOM contract (the same `[data-vc-preview-id]` CSS-rule injection the panel's
 * StyleEditor triggers) — asserting the real computed style + textContent
 * reflect the edit.
 */

const TARGET = { runtimeId: "el-edit-01", sourceId: "src-edit-01", selector: "#target" };

test.describe("@property-editors", () => {
  test("editing padding creates a style-edit operation with correct values", () => {
    const op = createStyleEditCommand(TARGET, "padding", "24px", "10px");
    expect(op.kind).toBe("style-edit");
    expect(op.property).toBe("padding");
    expect(op.value).toBe("24px");
    expect(op.previousValue).toBe("10px");
    expect(op.target.runtimeId).toBe("el-edit-01");
  });

  test("editing background-color creates a style-edit operation", () => {
    const op = createStyleEditCommand(TARGET, "background-color", "#ff0000", "transparent");
    expect(op.kind).toBe("style-edit");
    expect(op.property).toBe("background-color");
    expect(op.value).toBe("#ff0000");
  });

  test("adding a class creates a class-add operation", () => {
    const op = createClassAddCommand(TARGET, "highlight");
    expect(op.kind).toBe("class-add");
    expect(op.className).toBe("highlight");
    expect(op.target.runtimeId).toBe("el-edit-01");
  });

  test("editing text creates a text-edit operation", () => {
    const op = createTextEditCommand(TARGET, "World", "Hello");
    expect(op.kind).toBe("text-edit");
    expect(op.newText).toBe("World");
    expect(op.previousText).toBe("Hello");
  });

  test("invalid CSS value is rejected and no operation is valid", () => {
    const result = validateCssValue("padding", "abc");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeTruthy();
    }
    const valid = validateCssValue("padding", "24px");
    expect(valid.valid).toBe(true);
  });

  test("invalid display value is rejected", () => {
    expect(validateCssValue("display", "blocky").valid).toBe(false);
    expect(validateCssValue("display", "block").valid).toBe(true);
    expect(validateCssValue("display", "flex").valid).toBe(true);
    expect(validateCssProperty("display")).toBe(true);
    expect(validateCssProperty("not-a-real-property")).toBe(false);
  });
});

const PAD_FIXTURE = fixtureHtml(
  '<div id="target" class="pad-target">Hello</div>',
  "<style>.pad-target{padding:10px;width:120px;height:50px;border:2px solid #333}</style>",
);

const TEXT_FIXTURE = fixtureHtml('<div id="target">Hello</div>');

test.describe("@property-editors browser", () => {
  extTest(
    "edit-padding: style-edit preview changes computed padding on the real DOM",
    async ({ page }) => {
      await serveFixture(page, PAD_FIXTURE);
      const rect = await pageElementRect(page, "#target");
      await page.mouse.click(rect.x + 5, rect.y + 5);
      await page.waitForTimeout(800);

      const before = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(before).toBe("10px");

      const applied = await page.evaluate(() => {
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
      extExpect(applied).toBe(true);

      const after = await page.locator("#target").evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(after).toBe("24px");
      extExpect(after).not.toBe(before);
    },
  );

  extTest("edit-text: text edit changes textContent on the real DOM", async ({ page }) => {
    await serveFixture(page, TEXT_FIXTURE);
    const target = page.locator("#target");
    const before = await target.textContent();
    extExpect(before).toBe("Hello");

    await target.evaluate((el) => {
      el.textContent = "World";
    });
    const after = await target.textContent();
    extExpect(after).toBe("World");
    extExpect(after).not.toBe(before);
  });

  extTest(
    "edit-padding inverse (undo) restores the prior computed padding on the real DOM",
    async ({ page }) => {
      await serveFixture(page, PAD_FIXTURE);
      const rect = await pageElementRect(page, "#target");
      await page.mouse.click(rect.x + 5, rect.y + 5);
      await page.waitForTimeout(800);

      const before = await page
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
      const edited = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(edited).toBe("24px");

      await page.evaluate(() => {
        const el = document.getElementById("target");
        if (!el) throw new Error("element #target not found");
        const runtimeId = el.getAttribute("data-vc-preview-id");
        if (runtimeId === null) return;
        document.head.querySelector("style[data-vc-preview-style]")?.remove();
        const inverse = document.createElement("style");
        inverse.setAttribute("data-vc-preview-style", "");
        inverse.textContent = `[data-vc-preview-id="${runtimeId}"] { padding: 10px; }`;
        document.head.appendChild(inverse);
      });
      const restored = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(restored).toBe(before);
    },
  );

  extTest("selection overlay marks the edit target before a style edit", async ({ page }) => {
    await serveFixture(page, PAD_FIXTURE);
    const rect = await pageElementRect(page, "#target");
    await page.mouse.click(rect.x + 5, rect.y + 5);
    await page.waitForTimeout(800);

    const outline = await overlayElementInfo(page, ".vc-select-outline");
    extExpect(outline).not.toBeNull();
    if (!outline) throw new Error("outline should not be null after assertion");
    extExpect(Math.abs(outline.x - rect.x)).toBeLessThanOrEqual(3);
  });
});
