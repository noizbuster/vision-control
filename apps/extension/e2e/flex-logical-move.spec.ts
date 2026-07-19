import type { Page } from "@playwright/test";

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
  captureFlexLogicalMoveState,
  type FlexLogicalMoveCssState,
  type FlexLogicalMoveFlow,
  recordFlexLogicalMoveFlow,
  writeFlexLogicalMoveManifest,
} from "./flex-logical-move-visual-evidence.ts";
import { observeFlexPairBrowserErrors } from "./flex-pair-visual-evidence.ts";

type TargetZone = "x-start" | "y-end";

interface MoveCase {
  readonly flow: FlexLogicalMoveFlow;
  readonly containerCss: string;
  readonly cellCss: string;
  readonly targetZone: TargetZone;
}

const MOVE_CASES: readonly MoveCase[] = [
  {
    flow: "row-reverse",
    containerCss: "display:flex;flex-flow:row-reverse nowrap;direction:ltr;width:300px;height:60px",
    cellCss: "flex:0 0 70px;height:50px",
    targetZone: "x-start",
  },
  {
    flow: "rtl-row",
    containerCss: "display:flex;flex-flow:row nowrap;direction:rtl;width:300px;height:60px",
    cellCss: "flex:0 0 70px;height:50px",
    targetZone: "x-start",
  },
  {
    flow: "vertical-rl-row",
    containerCss:
      "display:flex;flex-flow:row nowrap;writing-mode:vertical-rl;direction:ltr;width:70px;height:300px",
    cellCss: "flex:0 0 70px;width:60px",
    targetZone: "y-end",
  },
] as const;

const WRAPPED_CASE: MoveCase = {
  flow: "wrapped-row",
  containerCss: "display:flex;flex-flow:row wrap;width:160px;height:120px",
  cellCss: "flex:0 0 70px;height:50px",
  targetZone: "x-start",
};

const moveFixture = (moveCase: MoveCase): string =>
  fixtureHtml(
    '<div id="move-parent"><div id="a" class="move-item">A</div><div id="b" class="move-item">B</div><div id="c" class="move-item">C</div></div>',
    `<style>
      body{padding:40px 0 0!important}#move-parent{${moveCase.containerCss}}
      .move-item{box-sizing:border-box;${moveCase.cellCss};border:1px solid #333}
    </style>`,
  );

const REPARENT_FIXTURE = fixtureHtml(
  `<main>
    <section id="source"><div id="card" class="move-item"><span id="card-label">Card</span></div></section>
    <section id="target"><div id="first" class="move-item">First</div><div id="middle" class="move-item"><span id="middle-label">Middle</span></div><div id="last" class="move-item">Last</div></section>
  </main>`,
  `<style>
    body{padding:40px 0 0!important}main{width:220px}.move-item{box-sizing:border-box;position:static;order:0}
    #source{width:120px;min-height:60px;padding:8px;border:1px solid #999}#card{width:80px;height:40px;border:1px solid #333}
    #target{display:flex;flex-direction:column;gap:8px;width:200px;margin-top:20px;padding:8px;border:1px solid #999}
    #target>.move-item{height:40px;border:1px solid #333}#middle-label{display:block;height:100%}
  </style>`,
);

async function moveInspectorAway(page: Page): Promise<void> {
  const header = await overlayElementInfo(page, ".vc-inspector__header");
  if (header === null) return;
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(16, 560, { steps: 8 });
  await page.mouse.up();
}

async function selectForMove(page: Page, selector: string, trailing = false): Promise<void> {
  const rect = await pageElementRect(page, selector);
  await page.mouse.click(
    trailing ? rect.x + rect.width - 6 : rect.x + 8,
    trailing ? rect.y + rect.height - 6 : rect.y + 8,
  );
  await expect(page.locator(selector)).toHaveAttribute("data-vc-preview-id", /.+/);
  await moveInspectorAway(page);
  await setInteractionMode(page, "Move");
}

const childOrder = (page: Page, selector: string): Promise<readonly string[]> =>
  page.locator(selector).evaluate((parent) => Array.from(parent.children).map((child) => child.id));

const cssState = (page: Page): Promise<readonly FlexLogicalMoveCssState[]> =>
  page.locator(".move-item").evaluateAll((elements) =>
    elements
      .map((element) => {
        const style = getComputedStyle(element);
        return { id: element.id, position: style.position, order: style.order };
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
  );

const targetPoint = async (page: Page, zone: TargetZone) => {
  const container = await pageElementRect(page, "#move-parent");
  switch (zone) {
    case "x-start":
      return { x: container.x + 4, y: container.y + container.height / 2 };
    case "y-end":
      return { x: container.x + container.width / 2, y: container.y + container.height - 4 };
  }
};

test.describe("@flex-pair logical Move", () => {
  for (const moveCase of MOVE_CASES) {
    test(`keeps held DOM stable then applies ${moveCase.flow} semantic order`, async ({ page }) => {
      await serveFixture(page, moveFixture(moveCase), `flex-move-${moveCase.flow}`);
      const panel = await openExtensionPanel(page);
      await panel.waitForSelector("[data-testid='panel-shell']");
      const errors = observeFlexPairBrowserErrors({ page, panel });
      await setInteractionMode(page, "Inspect");
      await selectForMove(page, "#a");
      const beforeCss = await cssState(page);
      const beforeOrder = await childOrder(page, "#move-parent");
      const source = await pageElementRect(page, "#a");
      const target = await targetPoint(page, moveCase.targetZone);
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 8 });
      const heldOrder = await childOrder(page, "#move-parent");
      expect(heldOrder).toEqual(["a", "b", "c"]);
      await captureFlexLogicalMoveState({
        page,
        panel,
        flow: moveCase.flow,
        phase: "held",
        errors,
      });
      await expect(panel.getByTestId("move-rejection-status")).toHaveCount(0);
      await page.mouse.up();
      await expect.poll(() => childOrder(page, "#move-parent")).toEqual(["b", "c", "a"]);
      const releasedOrder = await childOrder(page, "#move-parent");
      expect(await cssState(page)).toEqual(beforeCss);
      await captureFlexLogicalMoveState({
        page,
        panel,
        flow: moveCase.flow,
        phase: "released",
        errors,
      });
      await expect(panel.getByTestId("move-rejection-status")).toHaveCount(0);
      recordFlexLogicalMoveFlow({
        flow: moveCase.flow,
        beforeOrder,
        heldOrder,
        releasedOrder,
        beforeCss,
        releasedCss: await cssState(page),
      });
      await panel.close();
    });
  }

  test("rejects wrapped same-parent Move without order or position fallback", async ({ page }) => {
    await serveFixture(page, moveFixture(WRAPPED_CASE), "flex-move-wrapped-row");
    const panel = await openExtensionPanel(page);
    await panel.waitForSelector("[data-testid='panel-shell']");
    const errors = observeFlexPairBrowserErrors({ page, panel });
    await setInteractionMode(page, "Inspect");
    await selectForMove(page, "#a");
    const beforeCss = await cssState(page);
    const beforeOrder = await childOrder(page, "#move-parent");
    const source = await pageElementRect(page, "#a");
    const container = await pageElementRect(page, "#move-parent");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(container.x + container.width - 4, container.y + 25, { steps: 8 });
    const heldOrder = await childOrder(page, "#move-parent");
    expect(heldOrder).toEqual(["a", "b", "c"]);
    await captureFlexLogicalMoveState({
      page,
      panel,
      flow: WRAPPED_CASE.flow,
      phase: "held",
      errors,
    });
    await page.mouse.up();
    const releasedOrder = await childOrder(page, "#move-parent");
    expect(releasedOrder).toEqual(["a", "b", "c"]);
    expect(await cssState(page)).toEqual(beforeCss);
    await expect(panel.locator(".journal-entry")).toHaveCount(0);
    const rejection = panel.getByTestId("move-rejection-status");
    await expect(rejection).toHaveAttribute("role", "alert");
    await expect(rejection).toContainText("Move rejected");
    await expect(rejection).toContainText(
      "Flex Move does not support wrapped multi-line containers.",
    );
    const rejectionBounds = await rejection.evaluate((element) => {
      const header = document.querySelector(".app__header");
      const journal = document.querySelector("[data-testid='journal-strip']");
      if (!(header instanceof HTMLElement) || !(journal instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        headerBottom: header.getBoundingClientRect().bottom,
        journalTop: journal.getBoundingClientRect().top,
      };
    });
    expect(rejectionBounds).not.toBeNull();
    if (rejectionBounds !== null) {
      expect(rejectionBounds.top).toBeGreaterThanOrEqual(rejectionBounds.headerBottom);
      expect(rejectionBounds.bottom).toBeLessThanOrEqual(rejectionBounds.journalTop);
    }
    await captureFlexLogicalMoveState({
      page,
      panel,
      flow: WRAPPED_CASE.flow,
      phase: "released",
      errors,
    });
    recordFlexLogicalMoveFlow({
      flow: WRAPPED_CASE.flow,
      beforeOrder,
      heldOrder,
      releasedOrder,
      beforeCss,
      releasedCss: await cssState(page),
    });
    await panel.close();
  });

  test("inserts a cross-parent item at the logical sibling boundary", async ({ page }) => {
    await serveFixture(page, REPARENT_FIXTURE, "flex-move-reparent");
    const panel = await openExtensionPanel(page);
    await panel.waitForSelector("[data-testid='panel-shell']");
    const errors = observeFlexPairBrowserErrors({ page, panel });
    await setInteractionMode(page, "Inspect");
    await selectForMove(page, "#card", true);
    const beforeCss = await cssState(page);
    const beforeOrder = await childOrder(page, "#target");
    const source = await pageElementRect(page, "#card-label");
    const middle = await pageElementRect(page, "#middle-label");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(middle.x + 8, middle.y + 4, { steps: 8 });
    const heldOrder = await childOrder(page, "#target");
    expect(heldOrder).toEqual(["first", "middle", "last"]);
    await captureFlexLogicalMoveState({
      page,
      panel,
      flow: "cross-parent",
      phase: "held",
      errors,
    });
    await page.mouse.up();
    await expect
      .poll(() => childOrder(page, "#target"))
      .toEqual(["first", "card", "middle", "last"]);
    await expect(page.locator("#source > #card")).toHaveCount(0);
    expect(await cssState(page)).toEqual(beforeCss);
    const releasedOrder = await childOrder(page, "#target");
    await captureFlexLogicalMoveState({
      page,
      panel,
      flow: "cross-parent",
      phase: "released",
      errors,
    });
    recordFlexLogicalMoveFlow({
      flow: "cross-parent",
      beforeOrder,
      heldOrder,
      releasedOrder,
      beforeCss,
      releasedCss: await cssState(page),
    });
    await panel.close();
  });

  test.afterAll(() => writeFlexLogicalMoveManifest());
});
