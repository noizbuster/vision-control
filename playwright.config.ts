import { defineConfig } from "@playwright/test";

/**
 * Root orchestration config for ALL e2e suites across the monorepo.
 *
 * This config does NOT define its own testDir or projects. Instead it serves
 * as a reference for the overall e2e strategy. Each app that has e2e tests
 * owns its own `playwright.config.ts` and is invoked via its nx `e2e` target:
 *
 *   pnpm test:e2e                              # runs every project's e2e target
 *   pnpm nx run extension:e2e                  # extension suite only
 *   pnpm nx run playground-react-vite:e2e      # playground suite only
 *
 * Browser binary installation is required once:
 *   pnpm --filter @vision-control/testing exec playwright install chromium
 *
 * Chrome extensions cannot run in the legacy headless shell. The extension
 * suite runs headed locally and in new-headless mode under CI.
 */
export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
});
