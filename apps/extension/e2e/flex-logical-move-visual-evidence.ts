/// <reference types="node" />

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";
import type {
  FlexPairErrorObservation,
  FlexPairErrorObserver,
} from "./flex-pair-visual-evidence.ts";
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

export const FLEX_LOGICAL_MOVE_FLOWS = [
  "row-reverse",
  "rtl-row",
  "vertical-rl-row",
  "wrapped-row",
  "cross-parent",
] as const;

const FLEX_LOGICAL_MOVE_PHASES = ["held", "released"] as const;

export type FlexLogicalMoveFlow = (typeof FLEX_LOGICAL_MOVE_FLOWS)[number];
export type FlexLogicalMovePhase = (typeof FLEX_LOGICAL_MOVE_PHASES)[number];

export interface FlexLogicalMoveCssState {
  readonly id: string;
  readonly position: string;
  readonly order: string;
}

export interface FlexLogicalMoveFlowRecord {
  readonly flow: FlexLogicalMoveFlow;
  readonly beforeOrder: readonly string[];
  readonly heldOrder: readonly string[];
  readonly releasedOrder: readonly string[];
  readonly beforeCss: readonly FlexLogicalMoveCssState[];
  readonly releasedCss: readonly FlexLogicalMoveCssState[];
}

interface FlexLogicalMoveCaptureRecord {
  readonly theme: Theme;
  readonly flow: FlexLogicalMoveFlow;
  readonly phase: FlexLogicalMovePhase;
  readonly page: string;
  readonly panel: string;
  readonly pageViewport: BrowserViewport;
  readonly pageLayout: PageLayout;
  readonly panelViewport: BrowserViewport;
  readonly errors: FlexPairErrorObservation;
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
const captures: FlexLogicalMoveCaptureRecord[] = [];
const flows: FlexLogicalMoveFlowRecord[] = [];

function captureFileName(
  theme: Theme,
  flow: FlexLogicalMoveFlow,
  phase: FlexLogicalMovePhase,
  surface: Surface,
): string {
  const { label } = parseE2eViewport(process.env.VC_E2E_VIEWPORT);
  return `${label}-${theme}-move-${flow}-${phase}-${surface}.png`;
}

function capturePath(
  theme: Theme,
  flow: FlexLogicalMoveFlow,
  phase: FlexLogicalMovePhase,
  surface: Surface,
): string {
  return join(EVIDENCE_DIRECTORY, captureFileName(theme, flow, phase, surface));
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

export async function captureFlexLogicalMoveState(input: {
  readonly page: Page;
  readonly panel: Page;
  readonly flow: FlexLogicalMoveFlow;
  readonly phase: FlexLogicalMovePhase;
  readonly errors: FlexPairErrorObserver;
}): Promise<void> {
  mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
  const pageViewport = await browserViewport(input.page);
  const observedPageLayout = await pageLayout(input.page);
  const panelViewport = await browserViewport(input.panel);
  expect(observedPageLayout.rootScrollWidth).toBeLessThanOrEqual(observedPageLayout.width);

  for (const theme of ["light", "dark"] as const) {
    await input.page.emulateMedia({ colorScheme: theme });
    await input.panel.emulateMedia({ colorScheme: theme });
    await expect(input.panel.locator(`.app--${theme}`)).toBeVisible();

    const errors = input.errors.assertClean(input.phase);
    const pagePath = capturePath(theme, input.flow, input.phase, "page");
    const panelPath = capturePath(theme, input.flow, input.phase, "panel");
    await input.page.screenshot({ path: pagePath, fullPage: false });
    await input.panel.screenshot({ path: panelPath, fullPage: false });
    captures.push({
      theme,
      flow: input.flow,
      phase: input.phase,
      page: captureFileName(theme, input.flow, input.phase, "page"),
      panel: captureFileName(theme, input.flow, input.phase, "panel"),
      pageViewport,
      pageLayout: observedPageLayout,
      panelViewport,
      errors,
    });
  }
}

export function recordFlexLogicalMoveFlow(record: FlexLogicalMoveFlowRecord): void {
  flows.push(record);
}

function assertCaptureIntegrity(): void {
  for (const capture of captures) {
    expect(capture.page).not.toContain("/");
    expect(capture.panel).not.toContain("/");
    expect(capture.errors.page.consoleErrors).toEqual([]);
    expect(capture.errors.page.pageErrors).toEqual([]);
    expect(capture.errors.panel.consoleErrors).toEqual([]);
    expect(capture.errors.panel.pageErrors).toEqual([]);
  }
}

function assertCompleteMoveCaptureMatrix(): void {
  assertCaptureIntegrity();
  expect(captures).toHaveLength(
    FLEX_LOGICAL_MOVE_FLOWS.length * FLEX_LOGICAL_MOVE_PHASES.length * 2,
  );
  expect(flows).toHaveLength(FLEX_LOGICAL_MOVE_FLOWS.length);

  for (const flow of FLEX_LOGICAL_MOVE_FLOWS) {
    expect(flows.filter((record) => record.flow === flow)).toHaveLength(1);
    for (const phase of FLEX_LOGICAL_MOVE_PHASES) {
      const stateCaptures = captures.filter(
        (capture) => capture.flow === flow && capture.phase === phase,
      );
      expect(stateCaptures).toHaveLength(2);
      expect(stateCaptures.map((capture) => capture.theme).sort()).toEqual(["dark", "light"]);
    }
  }
}

export function writeFlexLogicalMoveManifest(): void {
  const viewport = parseE2eViewport(process.env.VC_E2E_VIEWPORT);
  assertCompleteMoveCaptureMatrix();
  writeFileSync(
    join(EVIDENCE_DIRECTORY, `${viewport.label}-flex-logical-move-evidence.json`),
    `${JSON.stringify(
      {
        viewport,
        artifactBase: ".",
        generatedAt: new Date().toISOString(),
        provenance: {
          browserProject: "chromium-extension",
          captureSpec: "e2e/flex-logical-move.spec.ts",
          captureUtility: "e2e/flex-logical-move-visual-evidence.ts",
        },
        captures,
        flows,
      },
      null,
      2,
    )}\n`,
  );
}
