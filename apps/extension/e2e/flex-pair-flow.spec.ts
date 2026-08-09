import type { Page } from "@playwright/test";

import {
  expect,
  openExtensionPanel,
  serveFixture,
  setInteractionMode,
  test,
} from "./fixtures/extension-test.ts";
import {
  expectPairDelta,
  FLEX_FLOWS,
  pairFixture,
  pairGeometry,
  pairHandleDisabled,
  selectPair,
  selectPairHandle,
} from "./flex-pair-flow-support.ts";
import {
  captureFlexPairVisualState,
  type FlexPairGeometry,
  observeFlexPairBrowserErrors,
  recordFlexPairGeometry,
  writeFlexPairFlowManifest,
} from "./flex-pair-visual-evidence.ts";

const REJECTIONS = [
  { name: "wrap", parentCss: "flex-wrap:wrap", drag: false },
  { name: "nonzero-order", neighborCss: "order:1", drag: false },
  {
    name: "intrinsic-min",
    neighborCss: "min-width:min-content",
    neighborContent: "MMMMMMMMMMMM",
    drag: true,
  },
  { name: "indefinite-container", parentCss: "width:auto;max-width:none", drag: false },
  { name: "transformed-ancestor", wrapperCss: "transform:translateX(-3px)", drag: false },
  { name: "auto-margin", neighborCss: "margin-left:auto", drag: false },
] as const;

const rowFlow = FLEX_FLOWS[0];
if (rowFlow === undefined) throw new Error("row flow fixture missing");

const describeSerial = test.describe.serial;

function formatPairSizes(geometry: FlexPairGeometry): string {
  const formatPixelSize = (value: number): string => `${Number(value.toFixed(1))}px`;
  return `${formatPixelSize(geometry.primary.width)} / ${formatPixelSize(geometry.neighbor.width)}`;
}

async function expectReadableJournalSummary(
  panel: Page,
  before: FlexPairGeometry,
  released: FlexPairGeometry,
): Promise<void> {
  const from = formatPairSizes(before);
  const to = formatPairSizes(released);
  const summary = panel.getByTestId("journal-summary");

  await expect(summary).toContainText(from);
  await expect(summary).toContainText(to);
  const tokens = await summary
    .locator(".journal-summary__from, .journal-summary__to")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return { text: element.textContent, lineFragments: range.getClientRects().length };
      }),
    );
  expect(tokens).toEqual([
    { text: from, lineFragments: 1 },
    { text: to, lineFragments: 1 },
  ]);
}

async function expectInspectorCardsReachableInScrollRegion(panel: Page): Promise<void> {
  const cards = [
    panel.getByTestId("diagnostics-drawer"),
    panel.locator("[data-section-title='Identity']"),
    panel.locator("[data-section-title='Pseudo']"),
  ] as const;

  for (const card of cards) {
    await card.scrollIntoViewIfNeeded();
    const bounds = await card.evaluate((element) => {
      const header = document.querySelector(".app__header");
      const scroll = document.querySelector(".app__scroll");
      const diagnostics = document.querySelector("[data-testid='diagnostics-drawer']");
      const journal = document.querySelector("[data-testid='journal-strip']");
      if (
        !(header instanceof HTMLElement) ||
        !(scroll instanceof HTMLElement) ||
        !(diagnostics instanceof HTMLElement) ||
        !(journal instanceof HTMLElement)
      ) {
        return null;
      }
      const cardRect = element.getBoundingClientRect();
      return {
        diagnosticsInScroll: scroll.contains(diagnostics),
        top: cardRect.top,
        bottom: cardRect.bottom,
        headerBottom: header.getBoundingClientRect().bottom,
        journalTop: journal.getBoundingClientRect().top,
      };
    });
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error("panel chrome was not rendered");
    expect(bounds.diagnosticsInScroll).toBe(true);
    expect(bounds.top + 1).toBeGreaterThanOrEqual(bounds.headerBottom);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.journalTop + 1);
  }
}

describeSerial("@flex-pair complete editor flow", () => {
  test("keeps one row pair preview through release, journal Undo, Redo, and Clear", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await serveFixture(page, pairFixture(rowFlow), "flex-pair-complete-row");
    const panel = await openExtensionPanel(page);
    await panel.waitForSelector("[data-testid='panel-shell']");
    const errors = observeFlexPairBrowserErrors({ page, panel });
    await setInteractionMode(page, "Inspect");
    const handle = await selectPairHandle(page, rowFlow.handle);
    const before = await pairGeometry(page);
    expect(
      [before.primary.width, before.neighbor.width, before.witnesses[0]?.width ?? 0].some(
        (value) => Math.abs(value - Math.round(value)) > 0.01,
      ),
    ).toBe(true);

    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + rowFlow.delta.x, y + rowFlow.delta.y, { steps: 10 });
    await expect
      .poll(async () => (await pairGeometry(page)).primary.width)
      .toBeGreaterThan(before.primary.width + 39);
    const held = await pairGeometry(page);
    expectPairDelta({ before, after: held, axis: rowFlow.axis });
    await captureFlexPairVisualState({ page, panel, state: "held", errors });
    await expectInspectorCardsReachableInScrollRegion(panel);
    recordFlexPairGeometry({
      scenario: "row",
      state: "held",
      before,
      after: held,
      journalRows: 0,
    });

    await page.mouse.up();
    await expect(panel.locator(".journal-entry")).toHaveCount(1);
    await expect(panel.locator(".journal-entry")).toContainText("Flex resize");
    const released = await pairGeometry(page);
    expectPairDelta({ before, after: released, axis: rowFlow.axis });
    await expectReadableJournalSummary(panel, before, released);
    await captureFlexPairVisualState({ page, panel, state: "released", errors });
    await expectInspectorCardsReachableInScrollRegion(panel);
    recordFlexPairGeometry({
      scenario: "row",
      state: "released",
      before,
      after: released,
      journalRows: 1,
    });

    await panel.getByRole("button", { name: "Undo last change" }).click();
    await expect
      .poll(async () => (await pairGeometry(page)).primary.width)
      .toBeCloseTo(before.primary.width, 0);
    const undone = await pairGeometry(page);
    await expectReadableJournalSummary(panel, before, released);
    await captureFlexPairVisualState({ page, panel, state: "undo", errors });
    await expectInspectorCardsReachableInScrollRegion(panel);
    recordFlexPairGeometry({
      scenario: "row",
      state: "undo",
      before,
      after: undone,
      journalRows: 1,
    });

    await panel.getByRole("button", { name: "Redo change" }).click();
    await expect
      .poll(async () => (await pairGeometry(page)).primary.width)
      .toBeCloseTo(released.primary.width, 0);
    const redone = await pairGeometry(page);
    expectPairDelta({ before, after: redone, axis: rowFlow.axis });
    await expectReadableJournalSummary(panel, before, released);
    await captureFlexPairVisualState({ page, panel, state: "redo", errors });
    await expectInspectorCardsReachableInScrollRegion(panel);
    recordFlexPairGeometry({
      scenario: "row",
      state: "redo",
      before,
      after: redone,
      journalRows: 1,
    });

    await panel.getByRole("button", { name: "Clear all changes" }).click();
    await expect(panel.locator(".journal-entry")).toHaveCount(0);
    await expect
      .poll(async () => (await pairGeometry(page)).primary.width)
      .toBeCloseTo(before.primary.width, 0);
    const cleared = await pairGeometry(page);
    expect(cleared.css).toEqual(before.css);
    await captureFlexPairVisualState({ page, panel, state: "clear", errors });
    await expectInspectorCardsReachableInScrollRegion(panel);
    recordFlexPairGeometry({
      scenario: "row",
      state: "clear",
      before,
      after: cleared,
      journalRows: 0,
    });
    await panel.close();
  });

  for (const flow of FLEX_FLOWS.slice(1)) {
    test(`resizes a ${flow.name} visual neighbor by equal logical deltas`, async ({ page }) => {
      await serveFixture(page, pairFixture(flow), `flex-pair-${flow.name}`);
      const panel = await openExtensionPanel(page);
      await panel.waitForSelector("[data-testid='panel-shell']");
      const errors = observeFlexPairBrowserErrors({ page, panel });
      await setInteractionMode(page, "Inspect");
      const handle = await selectPairHandle(page, flow.handle);
      await expect(panel.getByTestId("flex-resize-status")).toContainText("Paired resize ready");
      expect(await pairHandleDisabled(page, flow.handle)).toBe(false);
      const before = await pairGeometry(page);
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + flow.delta.x, y + flow.delta.y, { steps: 10 });
      await page.mouse.up();
      await expect(panel.getByTestId("flex-resize-status")).toContainText("Paired resize ready");
      await expect
        .poll(async () => (await pairGeometry(page)).primary[flow.axis])
        .toBeGreaterThan(before.primary[flow.axis] + 38);
      const released = await pairGeometry(page);
      expectPairDelta({ before, after: released, axis: flow.axis });
      await expect(panel.locator(".journal-entry")).toHaveCount(1);
      errors.assertClean("released");
      recordFlexPairGeometry({
        scenario: flow.name,
        state: "released",
        before,
        after: released,
        journalRows: 1,
      });
      await panel.close();
    });
  }

  for (const rejection of REJECTIONS) {
    test(`blocks ${rejection.name} with unchanged geometry and no operation`, async ({ page }) => {
      await serveFixture(page, pairFixture(rowFlow, rejection), `flex-pair-${rejection.name}`);
      const panel = await openExtensionPanel(page);
      await panel.waitForSelector("[data-testid='panel-shell']");
      const errors = observeFlexPairBrowserErrors({ page, panel });
      await setInteractionMode(page, "Inspect");
      const before = await pairGeometry(page);
      if (rejection.drag) {
        const handle = await selectPairHandle(page, rowFlow.handle);
        const x = handle.x + handle.width / 2;
        const y = handle.y + handle.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 40, y, { steps: 10 });
        await page.mouse.up();
      } else {
        await selectPair(page);
      }
      await expect(panel.getByTestId("flex-resize-status")).toHaveAttribute("role", "alert");
      await expect(panel.getByTestId("flex-resize-status")).not.toHaveText("");
      await expect(panel.locator(".journal-entry")).toHaveCount(0);
      const blocked = await pairGeometry(page);
      expect(blocked).toEqual(before);
      await captureFlexPairVisualState({
        page,
        panel,
        state: `blocked-${rejection.name}`,
        errors,
      });
      recordFlexPairGeometry({
        scenario: rejection.name,
        state: "blocked",
        before,
        after: blocked,
        journalRows: 0,
      });
      await panel.close();
    });
  }

  test.afterAll(() => writeFlexPairFlowManifest());
});
