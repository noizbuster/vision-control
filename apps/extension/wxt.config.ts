import { defineConfig } from "wxt";

const LOOPBACK_HOST_PERMISSIONS = [
  "http://localhost/*",
  "http://127.0.0.1/*",
  "http://[::1]/*",
] as const;

const OPTIONAL_CHROME_HOST_PERMISSIONS = ["http://*/*", "https://*/*"] as const;

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
});
