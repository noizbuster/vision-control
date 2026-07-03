import { SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";

import {
  detectSvelteUnsupported,
  injectSvelteMarkers,
  isSvelteProduction,
  registerMarkerEntries,
  SOURCE_MARKER_ATTRIBUTE,
  type SvelteMarkerTransformParams,
  visionControlSveltePreprocessor,
} from "./marker-plugin.js";

const SVELTE_FILE = "/workspace/src/App.svelte";

const baseParams = (code: string): SvelteMarkerTransformParams => ({
  code,
  filePath: SVELTE_FILE,
  workspaceRoot: "/workspace",
  include: ["**/*.svelte"],
  exclude: ["node_modules/**", "dist/**"],
});

describe("injectSvelteMarkers — basic host elements", () => {
  it("injects data-vc-source on a single div", () => {
    const code = "<div>Hello</div>";
    const result = injectSvelteMarkers(baseParams(code));
    expect(result).toBeDefined();
    expect(result?.code).toContain(`${SOURCE_MARKER_ATTRIBUTE}="`);
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("div");
    expect(result?.entries[0]?.workspaceRelativePath).toBe("src/App.svelte");
  });

  it("injects markers on multiple nested elements", () => {
    const code = '<div><button class="btn">Click</button><span>text</span></div>';
    const result = injectSvelteMarkers(baseParams(code));
    expect(result).toBeDefined();
    expect(result?.entries.length).toBe(3);
    const tags = result?.entries.map((e) => e.componentName).sort();
    expect(tags).toEqual(["button", "div", "span"]);
  });

  it("extracts static class attribute into the registry entry", () => {
    const code = '<button class="primary-btn">Save</button>';
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.entries[0]?.staticClassName).toBe("primary-btn");
  });

  it("handles self-closing tags", () => {
    const code = "<input />";
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("input");
  });

  it("marks custom components", () => {
    const code = '<MyComponent prop="value" />';
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("MyComponent");
  });

  it("skips elements inside script and style blocks", () => {
    const code =
      '<script>const html = "<div>inner</div>";</script>\n<div>real</div>\n<style>.x { color: red; }</style>';
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("div");
  });
});

describe("injectSvelteMarkers — edge cases", () => {
  it("returns undefined for non-svelte files", () => {
    const result = injectSvelteMarkers({
      ...baseParams("<div>hi</div>"),
      filePath: "/workspace/src/app.tsx",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for excluded paths", () => {
    const result = injectSvelteMarkers({
      ...baseParams("<div />"),
      filePath: "/workspace/node_modules/foo.svelte",
    });
    expect(result).toBeUndefined();
  });

  it("skips elements that already have data-vc-source", () => {
    const code = `<div ${SOURCE_MARKER_ATTRIBUTE}="existing">Hi</div>`;
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.entries.length).toBe(0);
  });

  it("handles attributes with quoted values containing > (no false end)", () => {
    const code = '<a href="a>b">link</a>';
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.entries.length).toBe(1);
    expect(result?.entries[0]?.componentName).toBe("a");
  });

  it("skips closing tags and comments", () => {
    const code = "<!-- comment --><div>hi</div></div>";
    const result = injectSvelteMarkers(baseParams(code));
    const tags = result?.entries.map((e) => e.componentName);
    expect(tags).toEqual(["div"]);
  });

  it("produces deterministic source ids for the same input", () => {
    const code = '<div class="box">x</div>';
    const r1 = injectSvelteMarkers(baseParams(code));
    const r2 = injectSvelteMarkers(baseParams(code));
    expect(r1?.entries[0]?.sourceId).toBe(r2?.entries[0]?.sourceId);
  });

  it("produces different source ids for different elements", () => {
    const code = '<div class="a">x</div><div class="b">y</div>';
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.entries[0]?.sourceId).not.toBe(result?.entries[1]?.sourceId);
  });
});

describe("detectSvelteUnsupported — explicit diagnostics", () => {
  it("reports slot tags", () => {
    const diagnostics = detectSvelteUnsupported("<slot />");
    expect(
      diagnostics.some((d) => d.kind === "unsupported-tag" && d.message.includes("slot")),
    ).toBe(true);
  });

  it("reports svelte:component", () => {
    const diagnostics = detectSvelteUnsupported("<svelte:component this={Comp} />");
    expect(diagnostics.some((d) => d.kind === "unsupported-dynamic-component")).toBe(true);
  });

  it("reports control blocks (if, each, await, snippet, key)", () => {
    const code = "{#if show}\n  <div />\n{/if}\n{#each items as item}\n  <span />\n{/each}";
    const diagnostics = detectSvelteUnsupported(code);
    expect(diagnostics.some((d) => d.kind === "unsupported-control-block")).toBe(true);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
  });

  it("reports NO diagnostics for basic host elements", () => {
    const code = '<div class="x"><button>ok</button></div>';
    const diagnostics = detectSvelteUnsupported(code);
    expect(diagnostics).toEqual([]);
  });

  it("integrates diagnostics into injectSvelteMarkers result", () => {
    const code = "<div><slot /></div>";
    const result = injectSvelteMarkers(baseParams(code));
    expect(result?.diagnostics.some((d) => d.kind === "unsupported-tag")).toBe(true);
    expect(result?.entries.some((e) => e.componentName === "div")).toBe(true);
  });
});

describe("isSvelteProduction — production gate", () => {
  it("is true under NODE_ENV=production", () => {
    expect(isSvelteProduction(undefined, { NODE_ENV: "production" })).toBe(true);
  });

  it("is false under NODE_ENV=development", () => {
    expect(isSvelteProduction(undefined, { NODE_ENV: "development" })).toBe(false);
  });

  it("is true when production flag is set", () => {
    expect(isSvelteProduction({ production: true }, { NODE_ENV: "development" })).toBe(true);
  });
});

describe("visionControlSveltePreprocessor — PreprocessorGroup", () => {
  it("returns a named preprocessor group", () => {
    const group = visionControlSveltePreprocessor();
    expect(group.name).toBe("vision-control-svelte-source-markers");
    expect(typeof group.markup).toBe("function");
  });

  it("transforms svelte files in dev mode", () => {
    const group = visionControlSveltePreprocessor({ workspaceRoot: "/workspace" });
    const code = "<div>hi</div>";
    const result = group.markup({ content: code, filename: "/workspace/src/App.svelte" });
    expect("code" in result).toBe(true);
    expect((result as { code: string }).code).toContain(SOURCE_MARKER_ATTRIBUTE);
  });

  it("returns content unchanged for non-svelte files", () => {
    const group = visionControlSveltePreprocessor({ workspaceRoot: "/workspace" });
    const result = group.markup({ content: "<div>hi</div>", filename: "/workspace/src/app.tsx" });
    expect((result as { code: string }).code).toBe("<div>hi</div>");
  });

  it("returns content unchanged in production", () => {
    const group = visionControlSveltePreprocessor({
      workspaceRoot: "/workspace",
      production: true,
    });
    const result = group.markup({
      content: "<div>hi</div>",
      filename: "/workspace/src/App.svelte",
    });
    expect((result as { code: string }).code).toBe("<div>hi</div>");
  });
});

describe("registerMarkerEntries — HMR-safe registry update", () => {
  it("registers entries and clears stale ones on re-register", () => {
    const registry = new SourceRegistry();
    const code = "<div>first</div>";
    const result = injectSvelteMarkers(baseParams(code));
    if (result === undefined) throw new Error("expected result");
    registerMarkerEntries(registry, "src/App.svelte", result.entries);
    expect(registry.lookup(result.entries[0]?.sourceId ?? "")).toBeDefined();

    const code2 = "<button>second</button>";
    const result2 = injectSvelteMarkers(baseParams(code2));
    if (result2 === undefined) throw new Error("expected result2");
    registerMarkerEntries(registry, "src/App.svelte", result2.entries);

    expect(registry.lookup(result.entries[0]?.sourceId ?? "")).toBeUndefined();
    expect(registry.lookup(result2.entries[0]?.sourceId ?? "")).toBeDefined();
  });
});
