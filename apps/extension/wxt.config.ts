import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["devtools", "storage", "activeTab", "scripting", "tabs", "webNavigation"],
    host_permissions: ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"],
    optional_permissions: ["debugger"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
  },
  // Vision Control collects no user data. The Firefox data-collection prompt is
  // Mozilla's store-disclosure requirement for extensions that DO collect data;
  // it does not apply here. Suppressed so a clean Firefox build is not noisy.
  suppressWarnings: {
    firefoxDataCollection: true,
  },
});
