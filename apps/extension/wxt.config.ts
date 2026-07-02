import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["devtools", "storage", "activeTab", "scripting", "tabs"],
    host_permissions: ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"],
    optional_permissions: ["debugger"],
  },
});
