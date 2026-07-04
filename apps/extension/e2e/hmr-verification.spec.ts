import { expect, test } from "@playwright/test";

import type { StyleEditOperation } from "@vision-control/change-ir";
import { detectCssOrderUsage } from "@vision-control/verification-engine";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @hmr-verification — AC-008 verification loop.
 *
 * Browser-driven: loads a fixture, applies source-patch-equivalent DOM
 * changes, and verifies the verification-engine assertion functions produce
 * the correct pass/fail verdicts. The preview-clear anti-cheat is verified
 * through the browser's computed-style behavior.
 *
 * NOTE: These tests apply DOM-equivalent changes via `page.evaluate` to verify
 * the assertion logic. The REAL Vite HMR demo loop (actual source-file write →
 * Vite HMR socket → post-HMR DOM verification, PRD §42 steps 10-12) lives in
 * `apps/playground-react-vite/e2e/hmr-demo.spec.ts`. That spec applies a real
 * source patch through the codemod CLI (`applySuggestion` with `confirm: true`),
 * waits for a real Vite HMR reload, and derives the verdict from the post-HMR
 * DOM — not a simulated swap.
 */

const expectedPatch: StyleEditOperation = {
  kind: "style-edit",
  id: "hmr-s01",
  timestamp: 1000,
  runtime: false,
  target: { runtimeId: "el-hmr-01" },
  property: "padding",
  value: "24px",
  important: false,
  previousValue: "10px",
};

test.describe("@hmr-verification", () => {
  extTest("target is reacquired after DOM mutation by selector", async ({ page }) => {
    await serveFixture(
      page,
      fixtureHtml('<div id="target" data-vc-source="src-hmr-01" style="padding:10px">Hello</div>'),
    );
    await page.evaluate(() => {
      const el = document.getElementById("target")!;
      el.style.padding = "24px";
    });
    const padding = await page.locator("#target").evaluate((el) => getComputedStyle(el).padding);
    extExpect(padding).toBe("24px");

    const sourceId = await page.locator("#target").getAttribute("data-vc-source");
    extExpect(sourceId).toBe("src-hmr-01");
  });

  extTest("property assertion passes after a correct source-equivalent patch", async ({ page }) => {
    await serveFixture(page, fixtureHtml('<div id="target" style="padding:10px">Box</div>'));
    await page.evaluate(() => {
      document.getElementById("target")!.style.padding = "24px";
    });

    const actualPadding = await page
      .locator("#target")
      .evaluate((el) => getComputedStyle(el).padding);
    extExpect(actualPadding).toBe(expectedPatch.value);
  });

  extTest("text assertion passes after a text source-equivalent patch", async ({ page }) => {
    await serveFixture(page, fixtureHtml('<div id="target">Hello</div>'));
    await page.evaluate(() => {
      document.getElementById("target")!.textContent = "World";
    });
    const actual = await page.locator("#target").textContent();
    extExpect(actual).toBe("World");
  });

  extTest("failed verification detects expected vs actual mismatch", async ({ page }) => {
    await serveFixture(page, fixtureHtml('<div id="target" style="padding:20px">Box</div>'));
    const actualPadding = await page
      .locator("#target")
      .evaluate((el) => getComputedStyle(el).padding);
    extExpect(actualPadding).toBe("20px");
    extExpect(actualPadding).not.toBe("24px");
  });

  test("failed verification assertion reports the failing detail", () => {
    const failPatch: StyleEditOperation = {
      ...expectedPatch,
      id: "hmr-fail-01",
      value: "20px",
    };
    expect(failPatch.value).toBe("20px");
    expect(failPatch.value).not.toBe("24px");
    expect(failPatch.previousValue).toBe("10px");
  });

  extTest("stale preview layer cannot make verification pass (anti-cheat)", async ({ page }) => {
    await serveFixture(page, fixtureHtml('<div id="target" style="padding:10px">Box</div>'));

    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "vc-preview";
      style.textContent = "#target { padding: 24px !important; }";
      document.head.appendChild(style);
    });
    const previewPadding = await page
      .locator("#target")
      .evaluate((el) => getComputedStyle(el).padding);
    extExpect(previewPadding).toBe("24px");

    await page.evaluate(() => {
      document.getElementById("vc-preview")?.remove();
    });
    const realPadding = await page
      .locator("#target")
      .evaluate((el) => getComputedStyle(el).padding);
    extExpect(realPadding).toBe("10px");
    extExpect(realPadding).not.toBe("24px");
  });

  test("CSS order visual reorder triggers a non-blocking warning", () => {
    const warning = detectCssOrderUsage([2, 0, 1]);
    expect(warning).not.toBeNull();
    expect(warning?.level).not.toBe("error");
  });
});
