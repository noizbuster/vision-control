import {
  expect,
  fixtureHtml,
  openExtensionPanel,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
  setInteractionMode,
  test,
} from "./fixtures/extension-test.ts";
import {
  captureFlexPairVisualState,
  observeFlexPairBrowserErrors,
  writeFlexPairVisualManifest,
} from "./flex-pair-visual-evidence.ts";

const VALID_PAIR_FIXTURE = fixtureHtml(
  '<div class="pair-row"><div id="primary" class="pair-cell primary"></div><div id="neighbor" class="pair-cell neighbor"></div><div id="witness" class="pair-cell witness"></div></div>',
  `<style>
    body{padding:40px 0 0!important}
    .pair-row{display:flex;flex-flow:row nowrap;width:100%;max-width:400px;height:80px}
    .pair-cell{box-sizing:border-box;height:80px;margin:0;padding:0;border:0 solid transparent}
    .primary{box-sizing:content-box;flex:1 1 138px;min-width:50px;max-width:300px;padding:0 10px;border-width:0 1px;background:#bfd7ff}
    .neighbor{flex:2 1 140px;min-width:50px;max-width:none;background:#ffd6a5}
    .witness{flex:0 0 100px;min-width:50px;max-width:none;background:#caffbf}
  </style>`,
);

const BLOCKED_FIXTURES = [
  {
    name: "wrapped",
    html: fixtureHtml(
      '<div class="pair-row"><div id="primary" class="pair-cell"></div><div class="pair-cell"></div></div>',
      `<style>
        .pair-row{display:flex;flex-flow:row wrap;width:240px;height:80px}
        .pair-cell{box-sizing:border-box;flex:0 0 120px;min-width:50px;height:80px;margin:0;padding:0;border:0 solid transparent}
      </style>`,
    ),
  },
  {
    name: "ordered",
    html: fixtureHtml(
      '<div class="pair-row"><div id="primary" class="pair-cell primary"></div><div class="pair-cell"></div></div>',
      `<style>
        .pair-row{display:flex;flex-flow:row nowrap;width:240px;height:80px}
        .pair-cell{box-sizing:border-box;flex:0 0 120px;min-width:50px;height:80px;margin:0;padding:0;border:0 solid transparent}
        .primary{order:1}
      </style>`,
    ),
  },
] as const;

const overlayFeedback = async (page: Parameters<typeof pageElementRect>[0]) =>
  page.evaluate(() => {
    const host = document.querySelector("[data-vc-overlay-host]");
    const outline = host?.shadowRoot?.querySelector(".vc-flex-pair-outline");
    const label = host?.shadowRoot?.querySelector(".vc-flex-pair-label");
    const selectionOutline = host?.shadowRoot?.querySelector(".vc-select-outline");
    return {
      outlineClass: outline?.className ?? "",
      label: label?.textContent ?? "",
      selectionVisible:
        selectionOutline instanceof HTMLElement && selectionOutline.style.display === "block",
      pageArtifactCount: document.querySelectorAll(".vc-flex-pair-outline, .vc-flex-pair-label")
        .length,
    };
  });

const eastHandleDisabled = async (page: Parameters<typeof pageElementRect>[0]) =>
  page.evaluate(() => {
    const host = document.querySelector("[data-vc-overlay-host]");
    const handle = host?.shadowRoot?.querySelector(".vc-handle-e");
    return handle instanceof HTMLButtonElement && handle.disabled;
  });

async function moveInspectorBelowResizeHandle(
  page: Parameters<typeof pageElementRect>[0],
): Promise<void> {
  const header = await overlayElementInfo(page, ".vc-inspector__header");
  expect(header).not.toBeNull();
  if (header === null) throw new Error("property inspector drag handle was not rendered");
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(16, 400, { steps: 8 });
  await page.mouse.up();
}

test.describe("@flex-pair-visual", () => {
  test("shows held valid paired Resize feedback in the shadow root and panel", async ({ page }) => {
    await serveFixture(page, VALID_PAIR_FIXTURE, "flex-pair-valid");
    const panel = await openExtensionPanel(page);
    await panel.waitForSelector("[data-testid='panel-shell']");
    const errors = observeFlexPairBrowserErrors({ page, panel });
    await panel.waitForTimeout(100);
    await setInteractionMode(page, "Inspect");
    const primary = await pageElementRect(page, "#primary");
    await page.mouse.click(primary.x + 10, primary.y + 10);
    await page.waitForTimeout(800);

    const readyFeedback = await overlayFeedback(page);
    expect(readyFeedback.selectionVisible).toBe(true);
    expect(readyFeedback.outlineClass).toContain("vc-flex-pair-outline--valid");
    expect(readyFeedback.label).toBe("Paired resize ready");
    expect(readyFeedback.pageArtifactCount).toBe(0);
    await expect(panel.getByTestId("flex-resize-status")).toHaveText("ResizePaired resize ready");

    await moveInspectorBelowResizeHandle(page);
    await captureFlexPairVisualState({ page, panel, state: "valid", errors });
    const handle = await overlayElementInfo(page, ".vc-handle-e");
    expect(handle).not.toBeNull();
    if (handle === null) throw new Error("east pair resize handle was not rendered");
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 10 });
    await page.waitForTimeout(100);

    const heldFeedback = await overlayFeedback(page);
    expect(heldFeedback.outlineClass).toContain("vc-flex-pair-outline--active");
    expect(heldFeedback.label).toBe("Resizing paired items");
    expect(heldFeedback.pageArtifactCount).toBe(0);

    await expect(panel.getByTestId("flex-resize-status")).toHaveText("ResizeResizing paired items");
    await captureFlexPairVisualState({ page, panel, state: "active", errors });
    await page.mouse.up();
    await panel.close();
  });

  for (const fixture of BLOCKED_FIXTURES) {
    test(`shows ${fixture.name} Flex rejection with a disabled edge and unchanged geometry`, async ({
      page,
    }) => {
      await serveFixture(page, fixture.html, `flex-pair-${fixture.name}`);
      const panel = await openExtensionPanel(page);
      await panel.waitForSelector("[data-testid='panel-shell']");
      const errors = observeFlexPairBrowserErrors({ page, panel });
      await panel.waitForTimeout(100);
      await setInteractionMode(page, "Inspect");
      const before = await pageElementRect(page, "#primary");
      await page.mouse.click(before.x + 10, before.y + 10);
      await page.waitForTimeout(800);

      const feedback = await overlayFeedback(page);
      expect(feedback.outlineClass).toContain("vc-flex-pair-outline--blocked");
      expect(feedback.label).not.toBe("");
      expect(feedback.pageArtifactCount).toBe(0);
      expect(await eastHandleDisabled(page)).toBe(true);

      await expect(panel.getByTestId("flex-resize-status")).toHaveAttribute("role", "alert");
      expect(await panel.getByTestId("flex-resize-status").textContent()).not.toBe("");
      await moveInspectorBelowResizeHandle(page);
      await captureFlexPairVisualState({
        page,
        panel,
        state: fixture.name === "wrapped" ? "blocked-wrapped" : "blocked-ordered",
        errors,
      });
      await panel.close();

      const after = await pageElementRect(page, "#primary");
      expect(after).toEqual(before);
    });
  }

  test.afterAll(() => {
    writeFlexPairVisualManifest();
  });
});
