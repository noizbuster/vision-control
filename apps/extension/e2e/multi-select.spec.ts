import {
  expect,
  fixtureHtml,
  overlayElementCount,
  pageElementRect,
  serveFixture,
  test,
} from "./fixtures/extension-test.ts";

/**
 * @multi-select — VC-V1V2-05 multi-select model, marquee selection, and overlay.
 *
 * The W2 wiring (plan task 2) made the content-runtime multi-select controller
 * live: shift+click toggles membership and stamps a distinctive `vc-multi-`
 * preview id on each toggled member; a marquee drag in empty space renders the
 * `.vc-marquee-rect` overlay element and feeds the hit-test into the
 * controller. The browser-driven tests below assert those observable
 * content-runtime effects against the built extension.
 *
 * The remaining scenarios (member/group outline rendering, common-parent
 * display, cross-frame/closed-shadow rejection diagnostics) render in the
 * DevTools panel context (the `useMultiSelect` hook + AlignmentPanel), which
 * the current Playwright overlay harness does not open; they stay `test.fixme`
 * with explicit OUT rationales (Task 41 release-readiness gate).
 *
 * Browser binary: `pnpm playwright install chromium` first.
 */

const BOARD_HTML = fixtureHtml(`
  <div id="row" style="display:flex;gap:16px;padding:40px">
    <div class="card" id="c1" style="width:80px;height:80px;background:#caa">1</div>
    <div class="card" id="c2" style="width:80px;height:80px;background:#aca">2</div>
    <div class="card" id="c3" style="width:80px;height:80px;background:#aac">3</div>
  </div>
`);

const previewIds = (
  page: import("@playwright/test").Page,
): Promise<{
  readonly c1: string | null;
  readonly c2: string | null;
  readonly c3: string | null;
}> =>
  page.evaluate(() => ({
    c1: document.getElementById("c1")?.getAttribute("data-vc-preview-id") ?? null,
    c2: document.getElementById("c2")?.getAttribute("data-vc-preview-id") ?? null,
    c3: document.getElementById("c3")?.getAttribute("data-vc-preview-id") ?? null,
  }));

test.describe("@multi-select browser", () => {
  test("Shift+Click three cards stamps each toggled member with a vc-multi preview id", async ({
    page,
  }) => {
    await serveFixture(page, BOARD_HTML);
    const c1 = await pageElementRect(page, "#c1");
    const c2 = await pageElementRect(page, "#c2");
    const c3 = await pageElementRect(page, "#c3");

    const shiftClick = async (r: { readonly x: number; readonly y: number }): Promise<void> => {
      await page.keyboard.down("Shift");
      await page.mouse.click(r.x + 10, r.y + 10);
      await page.keyboard.up("Shift");
      await page.waitForTimeout(150);
    };

    await shiftClick(c1);
    await shiftClick(c2);
    await shiftClick(c3);

    const ids = await previewIds(page);
    // The multi-select controller stamps a `vc-multi-` prefixed preview id on
    // every toggled member; plain (non-shift) selection stamps `vc-interaction-`
    // instead, so the prefix proves the shift+click toggle path executed.
    expect(ids.c1, "card 1 must carry a vc-multi preview id").toMatch(/^vc-multi-/);
    expect(ids.c2, "card 2 must carry a vc-multi preview id").toMatch(/^vc-multi-/);
    expect(ids.c3, "card 3 must carry a vc-multi preview id").toMatch(/^vc-multi-/);
  });

  test("marquee drag renders the marquee rectangle overlay", async ({ page }) => {
    await serveFixture(page, BOARD_HTML);

    // Start the marquee in empty body space above the row, then drag across the
    // cards. The marquee controller activates on pointer-down in body space.
    await page.mouse.move(10, 10);
    await page.mouse.down();
    await page.mouse.move(420, 220, { steps: 8 });

    const rectCount = await overlayElementCount(page, ".vc-marquee-rect");
    expect(rectCount, "the marquee rectangle must render during the drag").toBe(1);

    await page.mouse.up();
    await page.waitForTimeout(200);
  });

  // OUT: panel-context — member + group outlines render via the `useMultiSelect` hook in the DevTools panel; the overlay harness loads the content runtime + overlay only and does not open the DevTools panel.
  test.fixme("Shift+Click a selected card removes it from the group (toggle)", async () => {
    // The toggle-off path resets internal membership, but preview ids are not
    // removed on toggle, so the removal is only observable in the panel.
  });

  // OUT: panel-context — group bounding outline + member count render in the AlignmentPanel / multi-select inspector slot, not in the content overlay.
  test.fixme("group inspector section shows common parent and bounding rect", async () => {});

  // OUT: panel-context — the cross-frame rejection diagnostic surfaces in the inspector panel; cross-origin iframes are opaque by the browser's own security model so no content-runtime overlay signal is produced.
  test.fixme("Shift+Click across two frames is rejected with a diagnostic", async () => {});

  // OUT: panel-context — closed-shadow-root elements are excluded by construction (never reach the controller); no overlay signal is produced.
  test.fixme("Shift+Click on a closed shadow root element is rejected", async () => {});
});
