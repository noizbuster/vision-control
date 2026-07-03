import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the playground fixture app.
 *
 * The playground serves as the fixture page the extension inspects. These
 * e2e tests verify the fixture routes render and seeded edge cases exist,
 * independent of the extension. A dev server (or `vite preview`) must be
 * running on port 5173 before tests that navigate.
 *
 * Browser binary: `pnpm playwright install chromium` is required once.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.VC_PLAYGROUND_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
