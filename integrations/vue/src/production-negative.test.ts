import { describe, expect, it } from "vitest";

import {
  injectVueMarkers,
  isVueProduction,
  SOURCE_MARKER_ATTRIBUTE,
  visionControlVueMarkerPlugin,
} from "./marker-plugin.js";

/**
 * Production marker safety (ADR-008).
 *
 * The Vue adapter MUST NOT inject markers in production. The authoritative
 * negative test: when the production gate is active, no `data-vc-source`
 * attribute appears in the output.
 */
describe("production marker safety (ADR-008)", () => {
  const VUE_CODE = '<template><div class="box">Hello</div></template>';

  it("isVueProduction is true under NODE_ENV=production", () => {
    expect(isVueProduction(undefined, { NODE_ENV: "production" })).toBe(true);
  });

  it("visionControlVueMarkerPlugin.transform returns null in production", () => {
    const plugin = visionControlVueMarkerPlugin({
      workspaceRoot: "/workspace",
      production: true,
    });
    const result = plugin.transform(VUE_CODE, "/workspace/src/App.vue");
    expect(result).toBeNull();
  });

  it("visionControlVueMarkerPlugin.transform returns null under NODE_ENV=production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const plugin = visionControlVueMarkerPlugin({ workspaceRoot: "/workspace" });
      const result = plugin.transform(VUE_CODE, "/workspace/src/App.vue");
      expect(result).toBeNull();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("injectVueMarkers still works in dev (sanity: markers ARE present in dev)", () => {
    const result = injectVueMarkers({
      code: VUE_CODE,
      filePath: "/workspace/src/App.vue",
      workspaceRoot: "/workspace",
      include: ["**/*.vue"],
      exclude: ["node_modules/**"],
    });
    expect(result?.code).toContain(SOURCE_MARKER_ATTRIBUTE);
  });

  it("production output contains ZERO data-vc-source when gate is active", () => {
    const plugin = visionControlVueMarkerPlugin({
      workspaceRoot: "/workspace",
      production: true,
    });
    const result = plugin.transform(VUE_CODE, "/workspace/src/App.vue");
    expect(result).toBeNull();
    // If result is null, the original code is untouched -> no markers.
    expect(VUE_CODE).not.toContain(SOURCE_MARKER_ATTRIBUTE);
  });
});
