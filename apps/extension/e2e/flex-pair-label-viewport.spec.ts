import {
  expect,
  openExtensionPanel,
  serveFixture,
  setInteractionMode,
  test,
} from "./fixtures/extension-test.ts";
import {
  FLEX_FLOWS,
  pairFixture,
  pairGeometry,
  selectPair,
  selectPairHandle,
} from "./flex-pair-flow-support.ts";
import { observeFlexPairBrowserErrors } from "./flex-pair-visual-evidence.ts";

const rowFlow = FLEX_FLOWS[0];
if (rowFlow === undefined) throw new Error("row flow fixture missing");
const rowReverseFlow = FLEX_FLOWS[1];
if (rowReverseFlow === undefined) throw new Error("row-reverse flow fixture missing");
const rightAnchoredFlow = {
  ...rowReverseFlow,
  containerCss:
    "flex-direction:row-reverse;direction:ltr;writing-mode:horizontal-tb;width:100%;height:80px",
} as const;

test.describe("@flex-pair narrow feedback", () => {
  test("keeps intrinsic-min page feedback readable inside the narrow viewport", async ({
    page,
  }) => {
    await serveFixture(
      page,
      pairFixture(rowFlow, {
        neighborCss: "min-width:min-content",
        neighborContent: "MMMMMMMMMMMM",
      }),
      "flex-pair-intrinsic-min-narrow-feedback",
    );
    const panel = await openExtensionPanel(page);
    await panel.waitForSelector("[data-testid='panel-shell']");
    const errors = observeFlexPairBrowserErrors({ page, panel });
    await setInteractionMode(page, "Inspect");
    const before = await pairGeometry(page);
    const handle = await selectPairHandle(page, rowFlow.handle);

    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    await expect(panel.getByTestId("flex-resize-status")).toHaveAttribute("role", "alert");
    expect(await pairGeometry(page)).toEqual(before);
    await expect(panel.locator(".journal-entry")).toHaveCount(0);

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await panel.emulateMedia({ colorScheme: theme });
      await expect(panel.locator(`.app--${theme}`)).toBeVisible();
      const status = panel.getByTestId("flex-resize-status");
      await status.scrollIntoViewIfNeeded();
      const label = await page.evaluate(() => {
        const element = document
          .querySelector("[data-vc-overlay-host]")
          ?.shadowRoot?.querySelector(".vc-flex-pair-label");
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          x: rect.x,
          width: rect.width,
          viewportWidth: window.innerWidth,
        };
      });
      expect(label).not.toBeNull();
      if (label === null) throw new Error("intrinsic-min pair feedback label was not rendered");
      expect(label.text).not.toBe("");
      expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(label.viewportWidth - 4);
      const panelLayout = await panel.evaluate(() => {
        const status = document.querySelector("[data-testid='flex-resize-status']");
        const journal = document.querySelector("[data-testid='journal-strip']");
        if (!(status instanceof HTMLElement) || !(journal instanceof HTMLElement)) return null;
        const statusRect = status.getBoundingClientRect();
        const journalRect = journal.getBoundingClientRect();
        return {
          status: { top: statusRect.top, bottom: statusRect.bottom },
          journal: { top: journalRect.top, bottom: journalRect.bottom },
        };
      });
      expect(panelLayout).not.toBeNull();
      if (panelLayout === null) throw new Error("narrow panel layout elements were not rendered");
      expect(panelLayout.status.bottom).toBeLessThanOrEqual(panelLayout.journal.top);
      const scrollShell = await panel.evaluate(() => {
        const header = document.querySelector(".app__header");
        const main = document.querySelector(".app__main");
        const scroll = document.querySelector(".app__scroll");
        const diagnostics = document.querySelector("[data-testid='diagnostics-drawer']");
        const status = document.querySelector("[data-testid='flex-resize-status']");
        const journal = document.querySelector("[data-testid='journal-strip']");
        if (
          !(header instanceof HTMLElement) ||
          !(main instanceof HTMLElement) ||
          !(scroll instanceof HTMLElement) ||
          !(diagnostics instanceof HTMLElement) ||
          !(status instanceof HTMLElement) ||
          !(journal instanceof HTMLElement)
        ) {
          return null;
        }
        const headerRect = header.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        const journalRect = journal.getBoundingClientRect();
        return {
          diagnosticsInScroll: scroll.contains(diagnostics),
          statusInScroll: scroll.contains(status),
          headerBottom: headerRect.bottom,
          scrollTop: scrollRect.top,
          scrollBottom: scrollRect.bottom,
          journalTop: journalRect.top,
        };
      });
      expect(scrollShell).not.toBeNull();
      if (scrollShell === null) throw new Error("panel scroll shell was not rendered");
      expect(scrollShell.diagnosticsInScroll).toBe(true);
      expect(scrollShell.statusInScroll).toBe(true);
      expect(scrollShell.headerBottom).toBeLessThanOrEqual(scrollShell.scrollTop);
      expect(scrollShell.scrollBottom).toBeLessThanOrEqual(scrollShell.journalTop + 1);
      const panelControls = panel.locator(
        ".inspector-section > summary, [data-testid='diagnostics-drawer'] > summary",
      );
      const controlCount = await panelControls.count();
      expect(controlCount).toBeGreaterThan(0);
      for (let index = 0; index < controlCount; index += 1) {
        const control = panelControls.nth(index);
        await control.focus();
        await control.scrollIntoViewIfNeeded();
        const landing = await control.evaluate((element) => {
          const header = document.querySelector(".app__header");
          const journal = document.querySelector("[data-testid='journal-strip']");
          if (!(header instanceof HTMLElement) || !(journal instanceof HTMLElement)) return null;
          const controlRect = element.getBoundingClientRect();
          return {
            focused: document.activeElement === element,
            top: controlRect.top,
            bottom: controlRect.bottom,
            headerBottom: header.getBoundingClientRect().bottom,
            journalTop: journal.getBoundingClientRect().top,
          };
        });
        expect(landing).not.toBeNull();
        if (landing === null) throw new Error("panel focus landing was not rendered");
        expect(landing.focused).toBe(true);
        expect(landing.top).toBeGreaterThanOrEqual(landing.headerBottom);
        expect(landing.bottom).toBeLessThanOrEqual(landing.journalTop - 4);
      }
      errors.assertClean("blocked-intrinsic-min");
    }
    await panel.close();
  });

  test("keeps right-anchored page feedback inside the narrow viewport", async ({ page }) => {
    await serveFixture(
      page,
      pairFixture(rightAnchoredFlow, {
        primaryCss: "flex:0 0 100px",
        neighborCss: "flex:0 0 100px",
      }),
      "flex-pair-right-anchored-narrow-feedback",
    );
    const panel = await openExtensionPanel(page);
    await panel.waitForSelector("[data-testid='panel-shell']");
    const errors = observeFlexPairBrowserErrors({ page, panel });
    await setInteractionMode(page, "Inspect");
    await selectPair(page);

    const label = await page.evaluate(() => {
      const element = document
        .querySelector("[data-vc-overlay-host]")
        ?.shadowRoot?.querySelector(".vc-flex-pair-label");
      const primary = document.querySelector("#primary");
      if (!(element instanceof HTMLElement) || !(primary instanceof HTMLElement)) return null;
      const labelRect = element.getBoundingClientRect();
      const primaryRect = primary.getBoundingClientRect();
      return {
        text: element.textContent,
        left: labelRect.x,
        right: labelRect.x + labelRect.width,
        anchorLeft: primaryRect.x,
        viewportWidth: window.innerWidth,
      };
    });
    expect(label).not.toBeNull();
    if (label === null) throw new Error("right-anchored pair feedback label was not rendered");
    expect(label.text).toBe("Paired resize ready");
    expect(label.left).toBeLessThan(label.anchorLeft);
    expect(label.right).toBeLessThanOrEqual(label.viewportWidth - 4);
    errors.assertClean("valid");
    await panel.close();
  });
});
