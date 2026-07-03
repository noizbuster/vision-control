import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Vision Control extension e2e suite.
 *
 * Chrome extensions CANNOT run in the legacy headless shell. The new headless
 * mode ("headless: true" on Playwright >= 1.46) supports extensions, but for
 * maximum compatibility during development we default to headed. CI overrides
 * via the CI env var (Playwright sets headless automatically).
 *
 * The extension must be built (`pnpm nx run extension:build`) before running
 * these tests; the unpacked extension lives at `.output/chrome-mv3/`.
 *
 * Browser binary: `pnpm playwright install chromium` is required once before
 * the first run.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-extension",
      use: {
        ...devices["Desktop Chrome"],
        // Extensions require headed mode or new-headless; CI gets new-headless.
        headless: Boolean(process.env.CI),
        // The extension args are injected per-test via the testing helper.
        // See @vision-control/testing buildExtensionLaunchArgs.
      },
    },
  ],
});
