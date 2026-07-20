import { defineConfig } from "wxt";

/** All http(s) pages — Vision Control is a local development tool and needs to inspect any hostname. */
const PAGE_HOST_PERMISSIONS = ["http://*/*", "https://*/*"] as const;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: () => ({
    permissions: ["devtools", "storage", "activeTab", "scripting", "tabs", "webNavigation"],
    host_permissions: [...PAGE_HOST_PERMISSIONS],
    optional_permissions: ["debugger"],
  }),
  // Vision Control collects no user data. The Firefox data-collection prompt is
  // Mozilla's store-disclosure requirement for extensions that DO collect data;
  // it does not apply here. Suppressed so a clean Firefox build is not noisy.
  suppressWarnings: {
    firefoxDataCollection: true,
  },
});
