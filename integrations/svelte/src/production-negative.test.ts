import { describe, expect, it } from "vitest";

import {
  injectSvelteMarkers,
  isSvelteProduction,
  SOURCE_MARKER_ATTRIBUTE,
  visionControlSveltePreprocessor,
} from "./marker-plugin.js";

/**
 * Production marker safety (ADR-008).
 *
 * The Svelte adapter MUST NOT inject markers in production. The authoritative
 * negative test: when the production gate is active, no `data-vc-source`
 * attribute appears in the output.
 */
describe("production marker safety (ADR-008)", () => {
  const SVELTE_CODE = '<div class="box">Hello</div>';

  it("isSvelteProduction is true under NODE_ENV=production", () => {
    expect(isSvelteProduction(undefined, { NODE_ENV: "production" })).toBe(true);
  });

  it("visionControlSveltePreprocessor returns content unchanged in production", () => {
    const group = visionControlSveltePreprocessor({
      workspaceRoot: "/workspace",
      production: true,
    });
    const result = group.markup({
      content: SVELTE_CODE,
      filename: "/workspace/src/App.svelte",
    });
    expect((result as { code: string }).code).toBe(SVELTE_CODE);
  });

  it("visionControlSveltePreprocessor returns content unchanged under NODE_ENV=production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const group = visionControlSveltePreprocessor({ workspaceRoot: "/workspace" });
      const result = group.markup({
        content: SVELTE_CODE,
        filename: "/workspace/src/App.svelte",
      });
      expect((result as { code: string }).code).toBe(SVELTE_CODE);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("injectSvelteMarkers still works in dev (sanity: markers ARE present in dev)", () => {
    const result = injectSvelteMarkers({
      code: SVELTE_CODE,
      filePath: "/workspace/src/App.svelte",
      workspaceRoot: "/workspace",
      include: ["**/*.svelte"],
      exclude: ["node_modules/**"],
    });
    expect(result?.code).toContain(SOURCE_MARKER_ATTRIBUTE);
  });

  it("production output contains ZERO data-vc-source when gate is active", () => {
    const group = visionControlSveltePreprocessor({
      workspaceRoot: "/workspace",
      production: true,
    });
    const result = group.markup({
      content: SVELTE_CODE,
      filename: "/workspace/src/App.svelte",
    });
    const output = (result as { code: string }).code;
    expect(output).not.toContain(SOURCE_MARKER_ATTRIBUTE);
  });
});
