import { test } from "@playwright/test";

/**
 * @hmr-verification — AC-008 verification loop.
 *
 * Verifies: after a source patch + HMR/reload, the verification engine
 * reacquires the target, runs assertions (property/text/parent/order), and
 * reports pass/fail with evidence in the UI and MCP response.
 *
 * Requires the extension + playground + daemon running together.
 */

test.describe("@hmr-verification", () => {
  test.fixme("target is reacquired after HMR by source id + fingerprint", async ({ page }) => {
    // Given: an element is selected and a source patch is applied (e.g.,
    //        padding changed from 10px to 24px in the source file).
    // When: Vite HMR pushes the update and the DOM reconciles.
    // Then: the verification engine waits for DOM stability, clears the preview
    //       layer, and reacquires the target by sourceId + fingerprint.
    // Assert: the reacquired element's sourceId matches the original.
  });

  test.fixme("property assertion passes after a correct source patch", async ({ page }) => {
    // Given: a style-edit (padding -> 24px) was applied to the source.
    // When: HMR completes and verification runs.
    // Then: assertComputedStyle verifies padding === "24px" against the cleared DOM.
    // Assert: verification verdict is "pass"; the assertion result shows
    //         expected: "24px", actual: "24px".
  });

  test.fixme("text assertion passes after a text source patch", async ({ page }) => {
    // Given: a text-edit (Hello -> World) was applied to the source.
    // When: HMR completes and verification runs assertText.
    // Then: the reacquired element's textContent matches "World".
    // Assert: verification verdict is "pass".
  });

  test.fixme("failed verification reports the failure reason in the UI", async ({ page }) => {
    // Given: a source patch was applied but the value is wrong (e.g., padding
    //        set to 20px instead of the intended 24px).
    // When: verification runs.
    // Then: assertComputedStyle detects expected "24px" vs actual "20px".
    // Assert: verdict is "fail"; the retryContext message explains the mismatch.
    // Assert: the panel UI shows the failure with expected/actual values.
  });

  test.fixme("failed verification surfaces the reason in the MCP response", async ({ page }) => {
    // Given: a verification failure has occurred.
    // When: an agent queries vision_get_verification_result.
    // Then: the MCP response includes verdict "fail" and the assertion details.
    // Assert: the response JSON has assertions[].passed === false for the
    //         failing assertion with expected/actual/message.
  });

  test.fixme("stale preview layer cannot make verification pass", async ({ page }) => {
    // Given: the preview layer shows padding 24px (correct) but the source
    //        was NOT patched (the DOM still has 10px from the real source).
    // When: verification runs.
    // Then: clearAll() removes the preview stylesheet FIRST.
    // Assert: after clearing, assertComputedStyle reads 10px (the real DOM),
    //         verification verdict is "fail".
    // This is the critical anti-cheat: a preview that renders correctly does
    // NOT prove the source changed (PRD Appendix D.1).
  });
});
