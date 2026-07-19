import { expect, type Page } from "@playwright/test";

export const FLEX_PAIR_VISUAL_STATES = [
  "valid",
  "active",
  "held",
  "released",
  "undo",
  "redo",
  "clear",
  "blocked-wrap",
  "blocked-nonzero-order",
  "blocked-intrinsic-min",
  "blocked-indefinite-container",
  "blocked-transformed-ancestor",
  "blocked-auto-margin",
  "blocked-wrapped",
  "blocked-ordered",
] as const;

export type FlexPairVisualState = (typeof FLEX_PAIR_VISUAL_STATES)[number];

export interface FlexPairErrorTarget {
  readonly onConsoleError: (listener: (message: string) => void) => void;
  readonly onPageError: (listener: (message: string) => void) => void;
}

interface ErrorSurfaceObservation {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
}

export interface FlexPairErrorObservation {
  readonly page: ErrorSurfaceObservation;
  readonly panel: ErrorSurfaceObservation;
}

export interface FlexPairErrorObserver {
  assertClean(state: FlexPairVisualState): FlexPairErrorObservation;
}

interface MutableErrorSurfaceObservation {
  consoleErrors: string[];
  pageErrors: string[];
}

const createErrorSurfaceObservation = (): MutableErrorSurfaceObservation => ({
  consoleErrors: [],
  pageErrors: [],
});

const snapshot = (surface: MutableErrorSurfaceObservation): ErrorSurfaceObservation => ({
  consoleErrors: [...surface.consoleErrors],
  pageErrors: [...surface.pageErrors],
});

const pageErrorTarget = (page: Page): FlexPairErrorTarget => ({
  onConsoleError(listener) {
    page.on("console", (message) => {
      if (message.type() === "error") listener(message.text());
    });
  },
  onPageError(listener) {
    page.on("pageerror", (error) => {
      listener(error.message);
    });
  },
});

export function createFlexPairErrorObserver(input: {
  readonly page: FlexPairErrorTarget;
  readonly panel: FlexPairErrorTarget;
}): FlexPairErrorObserver {
  const page = createErrorSurfaceObservation();
  const panel = createErrorSurfaceObservation();
  input.page.onConsoleError((message) => page.consoleErrors.push(message));
  input.page.onPageError((message) => page.pageErrors.push(message));
  input.panel.onConsoleError((message) => panel.consoleErrors.push(message));
  input.panel.onPageError((message) => panel.pageErrors.push(message));

  return {
    assertClean(state) {
      const observation = { page: snapshot(page), panel: snapshot(panel) };
      expect(observation.page.consoleErrors, `${state}: page console errors`).toEqual([]);
      expect(observation.page.pageErrors, `${state}: page errors`).toEqual([]);
      expect(observation.panel.consoleErrors, `${state}: panel console errors`).toEqual([]);
      expect(observation.panel.pageErrors, `${state}: panel errors`).toEqual([]);
      return observation;
    },
  };
}

export function observeFlexPairBrowserErrors(input: {
  readonly page: Page;
  readonly panel: Page;
}): FlexPairErrorObserver {
  return createFlexPairErrorObserver({
    page: pageErrorTarget(input.page),
    panel: pageErrorTarget(input.panel),
  });
}
