import { SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";
import {
  detectVueUnsupported,
  injectVueMarkers,
  isVueProduction,
  registerMarkerEntries,
  SOURCE_MARKER_ATTRIBUTE,
  type VueMarkerTransformParams,
  visionControlVueMarkerPlugin,
} from "./marker-plugin.js";

const VUE_FILE = "/workspace/src/App.vue";

const baseParams = (code: string): VueMarkerTransformParams => ({
  code,
  filePath: VUE_FILE,
  workspaceRoot: "/workspace",
  include: ["**/*.vue"],
  exclude: ["node_modules/**", "dist/**"],
});

describe("injectVueMarkers — basic host elements", () => {
  it("injects data-vc-source on a single div", () => {
    const code = "<template><div>Hello</div></template>";
    const result = injectVueMarkers(baseParams(code));
    expect(result).toBeDefined();
    expect(result?.code).toContain(`${SOURCE_MARKER_ATTRIBUTE}="`);
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("div");
    expect(result?.entries[0]?.workspaceRelativePath).toBe("src/App.vue");
  });

  it("injects markers on multiple nested elements", () => {
    const code =
      '<template><div><button class="btn">Click</button><span>text</span></div></template>';
    const result = injectVueMarkers(baseParams(code));
    expect(result).toBeDefined();
    expect(result?.entries.length).toBe(3);
    const tags = result?.entries.map((e) => e.componentName).sort();
    expect(tags).toEqual(["button", "div", "span"]);
  });

  it("extracts static class attribute into the registry entry", () => {
    const code = '<template><button class="primary-btn">Save</button></template>';
    const result = injectVueMarkers(baseParams(code));
    expect(result?.entries[0]?.staticClassName).toBe("primary-btn");
  });

  it("handles self-closing tags", () => {
    const code = "<template><input /></template>";
    const result = injectVueMarkers(baseParams(code));
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("input");
  });

  it("marks custom components (PascalCase and kebab-case)", () => {
    const code = '<template><MyButton /><router-link to="/">Home</router-link></template>';
    const result = injectVueMarkers(baseParams(code));
    expect(result?.entries.length).toBe(2);
    const names = result?.entries.map((e) => e.componentName).sort();
    expect(names).toEqual(["MyButton", "router-link"]);
  });
});

describe("injectVueMarkers — edge cases", () => {
  it("returns undefined for non-vue files", () => {
    const result = injectVueMarkers({
      ...baseParams("<div>hi</div>"),
      filePath: "/workspace/src/app.tsx",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for excluded paths", () => {
    const result = injectVueMarkers({
      ...baseParams("<template><div /></template>"),
      filePath: "/workspace/node_modules/foo.vue",
    });
    expect(result).toBeUndefined();
  });

  it("skips elements that already have data-vc-source", () => {
    const code = `<template><div ${SOURCE_MARKER_ATTRIBUTE}="existing">Hi</div></template>`;
    const result = injectVueMarkers(baseParams(code));
    expect(result?.entries.length).toBe(0);
  });

  it("returns diagnostic when SFC has no template block", () => {
    const code = "<script setup>const x = 1;</script>";
    const result = injectVueMarkers(baseParams(code));
    expect(result).toBeDefined();
    expect(result?.entries.length).toBe(0);
    expect(result?.diagnostics.some((d) => d.kind === "no-template")).toBe(true);
  });

  it("handles attributes with quoted values containing > (no false end)", () => {
    const code = '<template><a href="a>b">link</a></template>';
    const result = injectVueMarkers(baseParams(code));
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("a");
  });

  it("skips closing tags and comments", () => {
    const code = "<template><!-- comment --><div>hi</div></template>";
    const result = injectVueMarkers(baseParams(code));
    expect(result?.entries.length).toBe(1);
  });

  it("produces deterministic source ids for the same input", () => {
    const code = '<template><div class="box">x</div></template>';
    const r1 = injectVueMarkers(baseParams(code));
    const r2 = injectVueMarkers(baseParams(code));
    expect(r1?.entries[0]?.sourceId).toBe(r2?.entries[0]?.sourceId);
  });

  it("produces different source ids for different elements", () => {
    const code = '<template><div class="a">x</div><div class="b">y</div></template>';
    const result = injectVueMarkers(baseParams(code));
    expect(result?.entries[0]?.sourceId).not.toBe(result?.entries[1]?.sourceId);
  });
});

describe("detectVueUnsupported — explicit diagnostics", () => {
  it("reports slot tags", () => {
    const diagnostics = detectVueUnsupported("<template><slot /></template>");
    expect(
      diagnostics.some((d) => d.kind === "unsupported-tag" && d.message.includes("slot")),
    ).toBe(true);
  });

  it("reports dynamic component", () => {
    const diagnostics = detectVueUnsupported('<template><component :is="comp" /></template>');
    expect(diagnostics.some((d) => d.kind === "unsupported-dynamic-component")).toBe(true);
  });

  it("reports suspense, teleport, keep-alive, transition", () => {
    const code = "<template><suspense /><teleport /><keep-alive /><transition /></template>";
    const diagnostics = detectVueUnsupported(code);
    const kinds = diagnostics.map((d) => d.kind);
    expect(kinds).toContain("unsupported-tag");
    expect(diagnostics.length).toBeGreaterThanOrEqual(4);
  });

  it("reports NO diagnostics for basic host elements", () => {
    const code = '<template><div class="x"><button>ok</button></div></template>';
    const diagnostics = detectVueUnsupported(code);
    expect(diagnostics).toEqual([]);
  });

  it("integrates diagnostics into injectVueMarkers result", () => {
    const code = "<template><div><slot /></div></template>";
    const result = injectVueMarkers(baseParams(code));
    expect(result?.diagnostics.some((d) => d.kind === "unsupported-tag")).toBe(true);
    // The div is still marked (addressable); the slot generates a diagnostic.
    expect(result?.entries.some((e) => e.componentName === "div")).toBe(true);
  });
});

describe("isVueProduction — production gate", () => {
  it("is true under NODE_ENV=production", () => {
    expect(isVueProduction(undefined, { NODE_ENV: "production" })).toBe(true);
  });

  it("is false under NODE_ENV=development", () => {
    expect(isVueProduction(undefined, { NODE_ENV: "development" })).toBe(false);
  });

  it("is true when production flag is set", () => {
    expect(isVueProduction({ production: true }, { NODE_ENV: "development" })).toBe(true);
  });
});

describe("visionControlVueMarkerPlugin — Vite plugin", () => {
  it("returns a named Vite plugin object", () => {
    const plugin = visionControlVueMarkerPlugin();
    expect(plugin.name).toBe("vision-control:vue-source-markers");
    expect(plugin.enforce).toBe("pre");
    expect(plugin.apply).toBe("serve");
  });

  it("transforms vue files in dev mode", () => {
    const plugin = visionControlVueMarkerPlugin({ workspaceRoot: "/workspace" });
    const code = "<template><div>hi</div></template>";
    const result = plugin.transform(code, "/workspace/src/App.vue");
    expect(result).not.toBeNull();
    expect(result?.code).toContain(SOURCE_MARKER_ATTRIBUTE);
  });

  it("returns null for non-vue files", () => {
    const plugin = visionControlVueMarkerPlugin({ workspaceRoot: "/workspace" });
    const result = plugin.transform("<div>hi</div>", "/workspace/src/app.tsx");
    expect(result).toBeNull();
  });
});

describe("registerMarkerEntries — HMR-safe registry update", () => {
  it("registers entries and clears stale ones on re-register", () => {
    const registry = new SourceRegistry();
    const code = "<template><div>first</div></template>";
    const result = injectVueMarkers(baseParams(code));
    if (result === undefined) throw new Error("expected result");
    registerMarkerEntries(registry, "src/App.vue", result.entries);
    expect(registry.lookup(result.entries[0]?.sourceId ?? "")).toBeDefined();

    // Re-register with different elements (clears old ones for the file).
    const code2 = "<template><button>second</button></template>";
    const result2 = injectVueMarkers(baseParams(code2));
    if (result2 === undefined) throw new Error("expected result2");
    registerMarkerEntries(registry, "src/App.vue", result2.entries);

    // Old div marker is gone.
    expect(registry.lookup(result.entries[0]?.sourceId ?? "")).toBeUndefined();
    // New button marker is present.
    expect(registry.lookup(result2.entries[0]?.sourceId ?? "")).toBeDefined();
  });
});
