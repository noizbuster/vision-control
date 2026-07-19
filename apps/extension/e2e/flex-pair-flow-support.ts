import type { Page } from "@playwright/test";

import {
  expect,
  fixtureHtml,
  overlayElementInfo,
  pageElementRect,
} from "./fixtures/extension-test.ts";
import type { FlexPairGeometry } from "./flex-pair-visual-evidence.ts";

export type MainAxis = "width" | "height";

export interface FlexFlowCase {
  readonly name: string;
  readonly axis: MainAxis;
  readonly handle: "e" | "s" | "w";
  readonly delta: { readonly x: number; readonly y: number };
  readonly containerCss: string;
  readonly cellCss: string;
  readonly primaryCss: string;
  readonly constraintCss: string;
}

interface PairFixtureOverrides {
  readonly parentCss?: string;
  readonly primaryCss?: string;
  readonly neighborCss?: string;
  readonly wrapperCss?: string;
  readonly neighborContent?: string;
}

const ROW_BASE = {
  axis: "width",
  cellCss: "height:80px",
  primaryCss: "padding:0 10px;border-width:0 1px",
  constraintCss: "min-width:50px;max-width:300px",
} as const;

const COLUMN_BASE = {
  axis: "height",
  cellCss: "width:100px",
  primaryCss: "padding:10px 0;border-width:1px 0",
  constraintCss: "min-height:50px;max-height:300px",
} as const;

export const FLEX_FLOWS: readonly FlexFlowCase[] = [
  {
    name: "row",
    ...ROW_BASE,
    handle: "e",
    delta: { x: 40, y: 0 },
    containerCss:
      "flex-direction:row;direction:ltr;writing-mode:horizontal-tb;width:min(100%,399px);height:80px",
  },
  {
    name: "row-reverse",
    ...ROW_BASE,
    handle: "e",
    delta: { x: 39, y: 0 },
    containerCss:
      "flex-direction:row-reverse;direction:ltr;writing-mode:horizontal-tb;width:335px;height:80px",
  },
  {
    name: "rtl-row",
    ...ROW_BASE,
    handle: "e",
    delta: { x: 39, y: 0 },
    containerCss:
      "flex-direction:row;direction:rtl;writing-mode:horizontal-tb;width:335px;height:80px",
  },
  {
    name: "column",
    ...COLUMN_BASE,
    handle: "s",
    delta: { x: 0, y: 40 },
    containerCss:
      "flex-direction:column;direction:ltr;writing-mode:horizontal-tb;width:100px;height:399px",
  },
  {
    name: "vertical-rl-row",
    ...COLUMN_BASE,
    handle: "s",
    delta: { x: 0, y: 40 },
    containerCss:
      "flex-direction:row;direction:ltr;writing-mode:vertical-rl;width:100px;height:399px",
  },
] as const;

export function pairFixture(flow: FlexFlowCase, overrides: PairFixtureOverrides = {}): string {
  return fixtureHtml(
    `<div class="ancestor"><div class="pair-row"><div id="primary" class="pair-cell primary"></div><div id="neighbor" class="pair-cell neighbor">${overrides.neighborContent ?? ""}</div><div id="witness" class="pair-cell witness"></div></div></div>`,
    `<style>
      body{padding:40px 0 0!important}.ancestor{${overrides.wrapperCss ?? ""}}
      .pair-row{display:flex;flex-wrap:nowrap;${flow.containerCss};${overrides.parentCss ?? ""}}
      .pair-cell{box-sizing:border-box;${flow.cellCss};margin:0;padding:0;border:0 solid transparent}
      .primary{box-sizing:content-box;flex:1 1 138px;${flow.constraintCss};${flow.primaryCss};${overrides.primaryCss ?? ""}}
      .neighbor{flex:2 1 140px;${flow.constraintCss};${overrides.neighborCss ?? ""}}
      .witness{flex:0 0 100px;${flow.constraintCss}}
    </style>`,
  );
}

export async function pairGeometry(page: Page): Promise<FlexPairGeometry> {
  const measured = await page.locator(".pair-cell").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        css: { id: element.id, position: style.position, order: style.order },
      };
    }),
  );
  const [primary, neighbor, ...witnesses] = measured;
  if (primary === undefined || neighbor === undefined) throw new Error("pair members missing");
  return {
    primary: primary.rect,
    neighbor: neighbor.rect,
    witnesses: witnesses.map((entry) => entry.rect),
    css: measured.map((entry) => entry.css),
  };
}

export async function selectPair(page: Page): Promise<void> {
  const primary = await pageElementRect(page, "#primary");
  await page.mouse.click(primary.x + 8, primary.y + 8);
  await expect(page.locator("#primary")).toHaveAttribute("data-vc-preview-id", /.+/);
  const header = await overlayElementInfo(page, ".vc-inspector__header");
  if (header !== null) {
    await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
    await page.mouse.down();
    await page.mouse.move(16, 500, { steps: 8 });
    await page.mouse.up();
  }
}

export async function selectPairHandle(page: Page, handle: FlexFlowCase["handle"]) {
  await selectPair(page);
  await expect.poll(() => overlayElementInfo(page, `.vc-handle-${handle}`)).not.toBeNull();
  const result = await overlayElementInfo(page, `.vc-handle-${handle}`);
  if (result === null) throw new Error(`${handle} pair handle missing`);
  return result;
}

export async function pairHandleDisabled(
  page: Page,
  handle: FlexFlowCase["handle"],
): Promise<boolean> {
  return page.evaluate((handleName) => {
    const host = document.querySelector("[data-vc-overlay-host]");
    const element = host?.shadowRoot?.querySelector(`.vc-handle-${handleName}`);
    return element instanceof HTMLButtonElement && element.disabled;
  }, handle);
}

export function expectPairDelta(input: {
  readonly before: FlexPairGeometry;
  readonly after: FlexPairGeometry;
  readonly axis: MainAxis;
}): void {
  expect(
    Math.abs(input.after.primary[input.axis] - input.before.primary[input.axis] - 40),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(input.after.neighbor[input.axis] - input.before.neighbor[input.axis] + 40),
  ).toBeLessThanOrEqual(1);
  expect(input.after.css).toEqual(input.before.css);
  for (const [index, before] of input.before.witnesses.entries()) {
    const after = input.after.witnesses[index];
    expect(after).toBeDefined();
    if (after === undefined) continue;
    for (const field of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(after[field] - before[field])).toBeLessThanOrEqual(1);
    }
  }
}
