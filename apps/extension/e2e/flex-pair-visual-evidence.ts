/// <reference types="node" />

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";
import {
  FLEX_PAIR_VISUAL_STATES,
  type FlexPairErrorObservation,
  type FlexPairErrorObserver,
  type FlexPairVisualState,
} from "./flex-pair-error-observer.ts";
import { parseE2eViewport } from "./viewport.ts";

type Theme = "light" | "dark";
type Surface = "page" | "panel";

interface BrowserViewport {
  readonly width: number;
  readonly height: number;
}

interface PageLayout extends BrowserViewport {
  readonly rootScrollWidth: number;
  readonly bodyScrollWidth: number;
}

interface CaptureRecord {
  readonly theme: Theme;
  readonly state: FlexPairVisualState;
  readonly page: string;
  readonly panel: string;
  readonly pageViewport: BrowserViewport;
  readonly pageLayout: PageLayout;
  readonly panelViewport: BrowserViewport;
  readonly errors: FlexPairErrorObservation;
}

export interface EvidenceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FlexPairGeometry {
  readonly primary: EvidenceRect;
  readonly neighbor: EvidenceRect;
  readonly witnesses: readonly EvidenceRect[];
  readonly css: readonly {
    readonly id: string;
    readonly position: string;
    readonly order: string;
  }[];
}

interface GeometryRecord {
  readonly scenario: string;
  readonly state: string;
  readonly before: FlexPairGeometry;
  readonly after: FlexPairGeometry;
  readonly journalRows: number;
}

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DEFAULT_EVIDENCE_DIRECTORY = join(
  REPOSITORY_ROOT,
  ".omo",
  "evidence",
  "flex-aware-editor-mode-visual-qa",
);
const EVIDENCE_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  process.env.VC_E2E_EVIDENCE_DIRECTORY ?? DEFAULT_EVIDENCE_DIRECTORY,
);
const captures: CaptureRecord[] = [];
const geometryRecords: GeometryRecord[] = [];

function captureFileName(theme: Theme, state: FlexPairVisualState, surface: Surface): string {
  const { label } = parseE2eViewport(process.env.VC_E2E_VIEWPORT);
  return `${label}-${theme}-${state}-${surface}.png`;
}

function capturePath(theme: Theme, state: FlexPairVisualState, surface: Surface): string {
  return join(EVIDENCE_DIRECTORY, captureFileName(theme, state, surface));
}

async function browserViewport(page: Page): Promise<BrowserViewport> {
  return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

async function pageLayout(page: Page): Promise<PageLayout> {
  return page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

async function flexPairLabelBounds(page: Page): Promise<EvidenceRect | null> {
  return page.evaluate(() => {
    const host = document.querySelector("[data-vc-overlay-host]");
    const label = host?.shadowRoot?.querySelector(".vc-flex-pair-label");
    if (!(label instanceof HTMLElement)) return null;
    const rect = label.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

export async function captureFlexPairVisualState(input: {
  readonly page: Page;
  readonly panel: Page;
  readonly state: FlexPairVisualState;
  readonly errors: FlexPairErrorObserver;
}): Promise<void> {
  mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
  const pageViewport = await browserViewport(input.page);
  const observedPageLayout = await pageLayout(input.page);
  const panelViewport = await browserViewport(input.panel);
  expect(observedPageLayout.rootScrollWidth).toBeLessThanOrEqual(observedPageLayout.width);
  const labelBounds = await flexPairLabelBounds(input.page);
  if (labelBounds !== null && labelBounds.width > 0) {
    expect(labelBounds.x).toBeGreaterThanOrEqual(0);
    expect(labelBounds.x + labelBounds.width).toBeLessThanOrEqual(pageViewport.width);
  }

  for (const theme of ["light", "dark"] as const) {
    await input.page.emulateMedia({ colorScheme: theme });
    await input.panel.emulateMedia({ colorScheme: theme });
    await expect(input.panel.locator(`.app--${theme}`)).toBeVisible();
    await input.panel.getByTestId("flex-resize-status").scrollIntoViewIfNeeded();

    const errors = input.errors.assertClean(input.state);
    const pagePath = capturePath(theme, input.state, "page");
    const panelPath = capturePath(theme, input.state, "panel");
    await input.page.screenshot({ path: pagePath, fullPage: false });
    await input.panel.screenshot({ path: panelPath, fullPage: false });
    captures.push({
      theme,
      state: input.state,
      page: captureFileName(theme, input.state, "page"),
      panel: captureFileName(theme, input.state, "panel"),
      pageViewport,
      pageLayout: observedPageLayout,
      panelViewport,
      errors,
    });
  }
}

function assertRecordedCaptureIntegrity(): void {
  for (const capture of captures) {
    expect(capture.page).not.toContain("/");
    expect(capture.panel).not.toContain("/");
    expect(capture.errors.page.consoleErrors).toEqual([]);
    expect(capture.errors.page.pageErrors).toEqual([]);
    expect(capture.errors.panel.consoleErrors).toEqual([]);
    expect(capture.errors.panel.pageErrors).toEqual([]);
  }
}

function assertCompleteVisualCaptureMatrix(): void {
  assertRecordedCaptureIntegrity();
  expect(captures).toHaveLength(FLEX_PAIR_VISUAL_STATES.length * 2);
  for (const state of FLEX_PAIR_VISUAL_STATES) {
    const stateCaptures = captures.filter((capture) => capture.state === state);
    expect(stateCaptures).toHaveLength(2);
    expect(stateCaptures.map((capture) => capture.theme).sort()).toEqual(["dark", "light"]);
  }
}

export function writeFlexPairVisualManifest(): void {
  const viewport = parseE2eViewport(process.env.VC_E2E_VIEWPORT);
  assertCompleteVisualCaptureMatrix();
  writeFileSync(
    join(EVIDENCE_DIRECTORY, `${viewport.label}-flex-pair-visual-captures.json`),
    `${JSON.stringify({ viewport, artifactBase: ".", captures }, null, 2)}\n`,
  );
}

export function recordFlexPairGeometry(record: GeometryRecord): void {
  geometryRecords.push(record);
}

export function writeFlexPairFlowManifest(): void {
  const viewport = parseE2eViewport(process.env.VC_E2E_VIEWPORT);
  assertRecordedCaptureIntegrity();
  writeFileSync(
    join(EVIDENCE_DIRECTORY, `${viewport.label}-flex-pair-flow-evidence.json`),
    `${JSON.stringify({ viewport, artifactBase: ".", captures, geometry: geometryRecords }, null, 2)}\n`,
  );
}

export type {
  FlexPairErrorObservation,
  FlexPairErrorObserver,
  FlexPairErrorTarget,
  FlexPairVisualState,
} from "./flex-pair-error-observer.ts";
export {
  createFlexPairErrorObserver,
  FLEX_PAIR_VISUAL_STATES,
  observeFlexPairBrowserErrors,
} from "./flex-pair-error-observer.ts";
