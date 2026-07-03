import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command: "next dev -p 3100",
    url: "http://localhost:3100",
    timeout: 60000,
    reuseExistingServer: true,
    cwd: ".",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
