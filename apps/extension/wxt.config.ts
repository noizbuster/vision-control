import { defineConfig } from "wxt";

import { resolveStartUrlsFromEnv } from "./scripts/dev-pair-helpers.mjs";

const LOOPBACK_HOST_PERMISSIONS = [
  "http://localhost/*",
  "http://127.0.0.1/*",
  "http://[::1]/*",
] as const;

const OPTIONAL_CHROME_HOST_PERMISSIONS = ["http://*/*", "https://*/*"] as const;

const startUrls = resolveStartUrlsFromEnv(process.env);

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    permissions: ["devtools", "storage", "activeTab", "scripting", "tabs", "webNavigation"],
    host_permissions: [...LOOPBACK_HOST_PERMISSIONS],
    ...(browser === "firefox"
      ? {}
      : { optional_host_permissions: [...OPTIONAL_CHROME_HOST_PERMISSIONS] }),
    optional_permissions: ["debugger"],
  }),
  // Vision Control collects no user data. The Firefox data-collection prompt is
  // Mozilla's store-disclosure requirement for extensions that DO collect data;
  // it does not apply here. Suppressed so a clean Firefox build is not noisy.
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  // When extension:dev-pair sets VC_PAIRING_HTTP_URL (or VC_DEV_START_URLS),
  // open those URLs in the WXT-launched Chromium so the content script can
  // auto-pair. Plain `extension:dev` leaves this unset (no startUrls).
  ...(startUrls !== undefined ? { webExt: { startUrls } } : {}),
});
