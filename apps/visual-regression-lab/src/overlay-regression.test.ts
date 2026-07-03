/**
 * Overlay visual regression suite (PRD §31.6).
 *
 * Renders every overlay scenario through the REAL overlay-ui factories in BOTH
 * DevTools themes, captures a deterministic "screenshot", and diffs each live
 * capture against its committed baseline (`overlay-baselines.ts`) via the
 * verification-engine `assertScreenshotSimilarity`. A diff above the threshold
 * (default 0.95) fails. Two detector tests prove the harness catches real
 * regressions (a theme swap and a structural swap each exceed the threshold).
 *
 * The byte-diff math suite (`screenshot-diff.fixture.test.ts`) stays in place —
 * this file augments it with actual overlay rendering.
 */

import {
  assertScreenshotSimilarity,
  DEFAULT_DIFF_THRESHOLD,
  type ScreenshotCropData,
} from "@vision-control/verification-engine";
import { describe, expect, it } from "vitest";
import { DEVTOOLS_THEMES, type DevToolsTheme } from "./devtools-theme.js";
import { BASELINE_HASHES, BASELINE_TEXT } from "./overlay-baselines.js";
import { mountAndRender } from "./overlay-renderer.js";
import { OVERLAY_SCENARIOS } from "./overlay-scenarios.js";
import { captureScreenshot, cropFromText } from "./rendered-screenshot.js";

const SCENARIO_LABEL = "scenario";
const THEME_LABEL = "theme";

function baselineCrop(id: string, theme: DevToolsTheme): ScreenshotCropData {
  const text = BASELINE_TEXT[id]?.[theme];
  if (text === undefined) {
    throw new Error(`no committed baseline for ${id}:${theme}`);
  }
  return cropFromText(text);
}

function captureLive(id: string, theme: DevToolsTheme): ScreenshotCropData {
  const scenario = OVERLAY_SCENARIOS.find((s) => s.id === id);
  if (scenario === undefined) {
    throw new Error(`unknown scenario ${id}`);
  }
  const label = `${id}:${theme}`;
  const mounted = mountAndRender(scenario, theme);
  try {
    return captureScreenshot(mounted.shadowRoot, mounted.container, label);
  } finally {
    mounted.unmount();
  }
}

describe("overlay regression — baseline match", () => {
  it("uses the project default 0.95 similarity threshold", () => {
    expect(DEFAULT_DIFF_THRESHOLD).toBe(0.95);
  });

  for (const scenario of OVERLAY_SCENARIOS) {
    describe(`${scenario.id}`, () => {
      for (const theme of DEVTOOLS_THEMES) {
        it(`matches the committed ${theme} baseline (similarity 1.0)`, () => {
          const baseline = baselineCrop(scenario.id, theme);
          const live = captureLive(scenario.id, theme);

          // Fast-fail: the committed hash must match the live capture's hash.
          expect(live.contentHash).toBe(baseline.contentHash);
          expect(live.contentHash).toBe(BASELINE_HASHES[scenario.id]?.[theme]);

          const result = assertScreenshotSimilarity(baseline, live);
          expect(result.verdict).toBe("pass");
          expect(result.identicalHash).toBe(true);
          expect(result.similarity).toBe(1);
        });
      }
    });
  }
});

describe("overlay regression — detector catches regressions", () => {
  it("fails when the dark render is diffed against the light baseline (theme drift)", () => {
    const baseline = baselineCrop("selected-outline", "light");
    const live = captureLive("selected-outline", "dark");

    const result = assertScreenshotSimilarity(baseline, live);
    expect(result.verdict).toBe("fail");
    expect(result.identicalHash).toBe(false);
    expect(result.similarity).toBeLessThan(DEFAULT_DIFF_THRESHOLD);
  });

  it("fails when one artifact's render is diffed against another's baseline (structural drift)", () => {
    const baseline = baselineCrop("resize-handles", "dark");
    const live = captureLive("snapping-guide", "dark");

    const result = assertScreenshotSimilarity(baseline, live);
    expect(result.verdict).toBe("fail");
    expect(result.similarity).toBeLessThan(DEFAULT_DIFF_THRESHOLD);
  });
});

describe("overlay regression — baseline integrity", () => {
  for (const scenario of OVERLAY_SCENARIOS) {
    for (const theme of DEVTOOLS_THEMES) {
      it(`${SCENARIO_LABEL}=${scenario.id} ${THEME_LABEL}=${theme} committed hash matches its text`, () => {
        const text = BASELINE_TEXT[scenario.id]?.[theme];
        expect(text, `baseline text present for ${scenario.id}:${theme}`).toBeDefined();
        const recomputed = cropFromText(text ?? "").contentHash;
        const committed = BASELINE_HASHES[scenario.id]?.[theme];
        expect(recomputed, "BASELINE_HASHES must stay in sync with BASELINE_TEXT").toBe(committed);
      });
    }
  }
});
