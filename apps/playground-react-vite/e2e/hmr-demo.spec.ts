import { readFile, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { applySuggestion } from "../../../packages/cli/dist/codemod/apply-suggestion.js";
import {
  type AssertionResult,
  createPlan,
} from "../../../packages/verification-engine/dist/index.js";

import {
  armHmrObserver,
  buildPaddingSuggestion,
  buildSnapshotTarget,
  FIXTURE_ABSOLUTE,
  INITIAL_PADDING,
  PATCHED_PADDING,
  paddingEdit,
  REPO_ROOT,
  SOURCE_ID,
  SOURCE_SELECTOR,
  snapshotTarget,
} from "./hmr-demo-helpers.ts";

/**
 * @hmr-demo — PRD §42 steps 10-12: REAL Vite HMR demo loop.
 *
 * This spec replaces the simulated `page.evaluate` swap in
 * `apps/extension/e2e/hmr-verification.spec.ts` with a real end-to-end HMR
 * flow:
 *
 *   1. The playground Vite dev server serves the HmrDemo fixture (§42 step 1).
 *   2. A REAL source-file edit is applied through the codemod's
 *      `applySuggestion` (`confirm: true` — the `--confirm` gate is NOT
 *      bypassed). This writes the actual `.tsx` file on disk (§42 step 10).
 *   3. Vite's file watcher detects the change and pushes an HMR update via
 *      WebSocket. React Fast Refresh re-renders the component (§42 step 11).
 *   4. A MutationObserver in the page detects the HMR-driven DOM mutation
 *      (mirrors `waitForHmrComplete` from `hmr-detector.ts`).
 *   5. The verification engine re-identifies the target by source-id cascade
 *      (`resolveTarget` strategy 1) against the REAL post-HMR DOM, and the
 *      plan's assertion (from `createPlan`) reads the REAL post-HMR computed
 *      style. The verdict is PASS only when the real DOM reflects the patch
 *      (§42 step 12).
 *
 * The verdict is NEVER derived from a `page.evaluate` swap. A preview-cleared
 * check alone would NOT pass this spec.
 */

let originalFixtureContent: string;

test.beforeAll(async () => {
  originalFixtureContent = await readFile(FIXTURE_ABSOLUTE, "utf-8");
});

test.afterAll(async () => {
  await writeFile(FIXTURE_ABSOLUTE, originalFixtureContent, "utf-8");
});

test.describe.configure({ mode: "serial" });

test.describe("@hmr-demo real Vite HMR (PRD §42 steps 10-12)", () => {
  test("§42 step 10-12: real source edit → Vite HMR → verification PASS", async ({ page }) => {
    await page.goto("/hmr-demo");
    await expect(page.locator(SOURCE_SELECTOR)).toBeVisible();

    const beforeSnapshot = await snapshotTarget(page);
    expect(beforeSnapshot.found, "target must be present before patch").toBe(true);
    expect(beforeSnapshot.padding, "pre-patch padding must be the initial value").toBe(
      INITIAL_PADDING,
    );

    // Arm the HMR observer BEFORE the file write so it catches the mutation.
    const hmrDetectedPromise = armHmrObserver(page);

    // REAL source-file edit via codemod (confirm: true). NOT a page.evaluate swap.
    const suggestion = await buildPaddingSuggestion(INITIAL_PADDING, PATCHED_PADDING);
    const applyResult = await applySuggestion(suggestion, {
      confirm: true,
      workspaceRoot: REPO_ROOT,
    });
    expect(applyResult.kind, "codemod must accept the confirmed suggestion").toBe("applied");
    if (applyResult.kind !== "applied") return;
    expect(
      applyResult.verification.sourceVerified,
      "codemod source-after-write verification must pass",
    ).toBe(true);

    const hmrDetected = await hmrDetectedPromise;
    expect(hmrDetected, "HMR must produce a real DOM mutation detected by the observer").toBe(true);

    await expect
      .poll(async () => (await snapshotTarget(page)).padding, {
        timeout: 15_000,
        message: "post-HMR computed padding must reflect the source patch",
      })
      .toBe(PATCHED_PADDING);

    // Source-id cascade: re-find the target in the REAL post-HMR DOM.
    const postHmrSnapshot = await snapshotTarget(page);
    expect(postHmrSnapshot.found, "source-id cascade must re-find the target post-HMR").toBe(true);

    // Verification engine: createPlan + run assertions against real post-HMR DOM.
    const target = buildSnapshotTarget(postHmrSnapshot);
    const plan = createPlan(paddingEdit(PATCHED_PADDING, INITIAL_PADDING, "hmr-demo-style-01"), {
      sourceId: SOURCE_ID,
      selector: SOURCE_SELECTOR,
      tagName: "div",
    });
    expect(plan.assertions.length).toBeGreaterThan(0);

    const results: AssertionResult[] = plan.assertions.map((entry) => entry.run(target));
    for (const r of results) {
      console.log(`[verification] ${r.name}: ${r.passed ? "PASS" : "FAIL"} — ${r.message}`);
    }
    expect(
      results.every((r) => r.passed),
      "verification verdict must be PASS against the real post-HMR DOM",
    ).toBe(true);

    // Anti-cheat: wrong expected value MUST fail, proving verdict is DOM-derived.
    const wrongPlan = createPlan(paddingEdit("99px", INITIAL_PADDING, "hmr-demo-style-wrong"), {
      sourceId: SOURCE_ID,
      selector: SOURCE_SELECTOR,
      tagName: "div",
    });
    const wrongResults = wrongPlan.assertions.map((entry) => entry.run(target));
    expect(
      wrongResults.every((r) => r.passed),
      "wrong expected value must FAIL — proving verdict is DOM-derived",
    ).toBe(false);
  });

  test("adversarial: wrong patch → verification FAIL with evidence", async ({ page }) => {
    await writeFile(FIXTURE_ABSOLUTE, originalFixtureContent, "utf-8");

    await page.goto("/hmr-demo");
    await expect(page.locator(SOURCE_SELECTOR)).toBeVisible();

    const baseline = await snapshotTarget(page);
    expect(baseline.padding).toBe(INITIAL_PADDING);

    const hmrDetectedPromise = armHmrObserver(page);
    const suggestion = await buildPaddingSuggestion(INITIAL_PADDING, PATCHED_PADDING);
    const applyResult = await applySuggestion(suggestion, {
      confirm: true,
      workspaceRoot: REPO_ROOT,
    });
    expect(applyResult.kind).toBe("applied");

    await hmrDetectedPromise;
    await expect
      .poll(async () => (await snapshotTarget(page)).padding, {
        timeout: 15_000,
        message: "HMR must apply the patch",
      })
      .toBe(PATCHED_PADDING);

    const snap = await snapshotTarget(page);
    const target = buildSnapshotTarget(snap);

    const correctPlan = createPlan(paddingEdit(PATCHED_PADDING, INITIAL_PADDING, "adv-correct"), {
      sourceId: SOURCE_ID,
    });
    expect(correctPlan.assertions.map((e) => e.run(target)).every((r) => r.passed)).toBe(true);

    const wrongPlan = createPlan(paddingEdit("48px", INITIAL_PADDING, "adv-wrong"), {
      sourceId: SOURCE_ID,
    });
    const wrongResults = wrongPlan.assertions.map((e) => e.run(target));
    expect(
      wrongResults.every((r) => r.passed),
      "wrong expectation must fail against real DOM",
    ).toBe(false);
    for (const r of wrongResults) {
      console.log(`[adversarial] ${r.name}: ${r.passed ? "PASS" : "FAIL"} — ${r.message}`);
    }
  });
});
