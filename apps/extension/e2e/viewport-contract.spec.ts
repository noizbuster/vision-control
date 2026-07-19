import { expect, openExtensionPanel, test } from "./fixtures/extension-test.ts";
import { parseE2eViewport } from "./viewport.ts";

test.describe("@flex-pair-visual", () => {
  test("uses VC_E2E_VIEWPORT for the inspected-page browser viewport", async ({ page }) => {
    const expected = parseE2eViewport(process.env.VC_E2E_VIEWPORT);
    const observed = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const panel = await openExtensionPanel(page);
    const observedPanel = await panel.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    expect(observed).toEqual({ width: expected.width, height: expected.height });
    expect(observedPanel).toEqual({ width: expected.width, height: expected.height });
    await panel.close();
  });
});
