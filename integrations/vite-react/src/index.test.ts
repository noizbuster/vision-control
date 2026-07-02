import { SourceRegistry } from "@vision-control/source-registry";
import type { Plugin } from "vite";
import { describe, expect, it } from "vitest";

import { findJsxElements, getElementName, parseJsx } from "./babel-helpers.js";
import { resolveProduction } from "./config.js";
import { visionControlSourceMarkerPlugin } from "./plugin.js";
import { generateSourceId } from "./source-id.js";

const ROOT = "/repo";
const id = (rel: string): string => `${ROOT}/${rel}`;

interface TransformMap {
  readonly version: number;
  readonly mappings: string;
}
interface TransformOutput {
  readonly code: string;
  readonly map: TransformMap;
}

// Vite annotates transform/config with a `this: PluginContext`; calling the
// hooks directly in a unit test needs a plain callable view, so we narrow to a
// precise interface (no `any`) before invoking.
interface CallablePlugin {
  config?: (config: unknown, env: { command: "build" | "serve"; mode: string }) => void;
  transform?: (code: string, id: string) => TransformOutput | undefined;
  handleHotUpdate?: (ctx: { file: string }) => void;
}

const callable = (plugin: Plugin): CallablePlugin => plugin as unknown as CallablePlugin;

const transform = (plugin: Plugin, code: string, moduleId: string) =>
  callable(plugin).transform?.(code, moduleId);

const devPlugin = (opts?: Parameters<typeof visionControlSourceMarkerPlugin>[0]): Plugin => {
  const plugin = visionControlSourceMarkerPlugin({ workspaceRoot: ROOT, ...opts });
  callable(plugin).config?.({}, { command: "serve", mode: "development" });
  return plugin;
};

const prodPlugin = (opts?: Parameters<typeof visionControlSourceMarkerPlugin>[0]): Plugin => {
  const plugin = visionControlSourceMarkerPlugin({ workspaceRoot: ROOT, ...opts });
  callable(plugin).config?.({}, { command: "build", mode: "production" });
  return plugin;
};

const SOURCE_ID_VALUES = /data-vc-source="([A-Za-z0-9_-]+)"/g;
const allSourceIds = (code: string): string[] =>
  [...code.matchAll(SOURCE_ID_VALUES)].map((m) => m[1] ?? "");

describe("babel helpers", () => {
  it("infers component and host-tag names", () => {
    const ast = parseJsx("const A = () => <Card />; const B = () => <div />;");
    const els = findJsxElements(ast, "const A = () => <Card />; const B = () => <div />;");
    expect(els.map((e) => e.componentName).sort()).toEqual(["Card", "div"]);
  });

  it("captures a static className and static text", () => {
    const code = 'const X = () => <div className="card">Hello</div>;';
    const el = findJsxElements(parseJsx(code), code)[0];
    expect(el?.staticClassName).toBe("card");
    expect(el?.staticText).toBe("Hello");
  });

  it("reports undefined for dynamic className and mixed children", () => {
    const code = "const X = ({c, n}) => <div className={c}>Hi {n}</div>;";
    const el = findJsxElements(parseJsx(code), code)[0];
    expect(el?.staticClassName).toBeUndefined();
    expect(el?.staticText).toBeUndefined();
  });

  it("getElementName handles member and namespaced names", () => {
    const ast = parseJsx("const X = () => <Foo.Bar />;");
    const el = findJsxElements(ast, "const X = () => <Foo.Bar />;")[0];
    expect(el?.componentName).toBe("Foo.Bar");
    expect(
      getElementName({
        type: "JSXMemberExpression" as const,
        object: { type: "JSXIdentifier" as const, name: "A" },
        property: { type: "JSXIdentifier" as const, name: "B" },
      }),
    ).toBe("A.B");
  });
});

describe("generateSourceId", () => {
  const base = {
    workspaceRelativePath: "src/App.tsx",
    range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 10 },
    fingerprint: "fp-a",
  };

  it("is deterministic for identical input", () => {
    expect(generateSourceId(base)).toBe(generateSourceId(base));
  });

  it("is opaque (base64url, no path separators)", () => {
    const sid = generateSourceId(base);
    expect(sid).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sid).not.toContain("/");
    expect(sid).not.toContain("\\");
  });

  it("differs when only the fingerprint differs (collision resistance)", () => {
    const a = generateSourceId(base);
    const b = generateSourceId({ ...base, fingerprint: "fp-b" });
    expect(a).not.toBe(b);
  });

  it("differs when only the range differs", () => {
    const a = generateSourceId(base);
    const b = generateSourceId({
      ...base,
      range: { startLine: 2, startColumn: 0, endLine: 2, endColumn: 10 },
    });
    expect(a).not.toBe(b);
  });
});

describe("visionControlSourceMarkerPlugin — positive injection", () => {
  it("injects data-vc-source onto a host div with className and text", () => {
    const plugin = devPlugin();
    const out = transform(
      plugin,
      'export const X = () => <div className="card">Hello</div>;',
      id("src/App.tsx"),
    );
    expect(out).toBeDefined();
    const code = out?.code ?? "";
    expect(code).toContain('data-vc-source="');
    // The marker lands right after the tag name, before className:
    expect(code).toMatch(/<div\s+data-vc-source="[A-Za-z0-9_-]+"\s+className="card">Hello<\/div>/);
  });

  it("injects onto every JSX element, including nested and self-closing", () => {
    const plugin = devPlugin();
    const out = transform(
      plugin,
      "export const X = () => <div><span /><Card>hi</Card></div>;",
      id("src/App.tsx"),
    );
    expect(allSourceIds(out?.code ?? "").length).toBe(3);
  });

  it("skips JSX fragments (no name, not addressable)", () => {
    const plugin = devPlugin();
    const out = transform(plugin, "export const X = () => <>nope</>;", id("src/App.tsx"));
    expect(out).toBeUndefined();
  });

  it("returns a version-3 source map with mappings", () => {
    const plugin = devPlugin();
    const out = transform(plugin, "export const X = () => <div />;", id("src/App.tsx"));
    expect(out?.map.version).toBe(3);
    expect(typeof out?.map.mappings).toBe("string");
    expect(out?.map.mappings.length).toBeGreaterThan(0);
  });
});

describe("visionControlSourceMarkerPlugin — negative: production gating", () => {
  it("does NOT inject when command is build", () => {
    const plugin = prodPlugin();
    const out = transform(plugin, "export const X = () => <div />;", id("src/App.tsx"));
    expect(out).toBeUndefined();
  });

  it("does NOT inject when production flag is set, even in serve", () => {
    const plugin = devPlugin({ production: true });
    const out = transform(plugin, "export const X = () => <div />;", id("src/App.tsx"));
    expect(out).toBeUndefined();
  });

  it("resolveProduction fails safe: build OR explicit flag both disable", () => {
    expect(resolveProduction({ production: false }, "serve")).toBe(false);
    expect(resolveProduction({ production: false }, "build")).toBe(true);
    expect(resolveProduction({ production: true }, "serve")).toBe(true);
    expect(resolveProduction({ production: true }, "build")).toBe(true);
  });
});

describe("visionControlSourceMarkerPlugin — negative: file filtering", () => {
  it("skips non-JSX extensions", () => {
    const plugin = devPlugin();
    for (const ext of ["js", "ts", "css", "json"]) {
      expect(transform(plugin, "export const x = 1;", id(`src/f.${ext}`))).toBeUndefined();
    }
  });

  it("excludes node_modules at any depth", () => {
    const plugin = devPlugin();
    const out = transform(
      plugin,
      "export const X = () => <div />;",
      id("packages/app/node_modules/lib/Comp.jsx"),
    );
    expect(out).toBeUndefined();
  });

  it("honors a custom exclude pattern", () => {
    const plugin = devPlugin({ exclude: ["**/*.spec.tsx", "node_modules/**"] });
    const out = transform(plugin, "export const X = () => <div />;", id("src/f.spec.tsx"));
    expect(out).toBeUndefined();
  });

  it("honors include (a file outside include is skipped)", () => {
    const plugin = devPlugin({ include: ["src/components/**"] });
    const out = transform(plugin, "export const X = () => <div />;", id("src/App.tsx"));
    expect(out).toBeUndefined();
  });
});

describe("visionControlSourceMarkerPlugin — opacity (no absolute path leakage)", () => {
  it("never embeds the workspace root or absolute path in the output", () => {
    const plugin = devPlugin();
    const out = transform(
      plugin,
      'export const X = () => <div className="x">y</div>;',
      id("src/App.tsx"),
    );
    const code = out?.code ?? "";
    expect(code).not.toContain(ROOT);
    expect(code).not.toContain("/repo/");
    for (const sid of allSourceIds(code)) {
      expect(sid).not.toContain("/");
      expect(sid).not.toContain("\\");
      expect(sid).not.toContain("src");
      expect(sid).not.toContain("App");
    }
  });
});

describe("visionControlSourceMarkerPlugin — idempotency", () => {
  it("does not double-mark an already-marked element on re-transform", () => {
    const plugin = devPlugin();
    const first = transform(plugin, "export const X = () => <div />;", id("src/App.tsx"));
    const second = transform(plugin, first?.code ?? "", id("src/App.tsx"));
    expect(allSourceIds(first?.code ?? "").length).toBe(1);
    expect(second).toBeUndefined();
  });
});

describe("visionControlSourceMarkerPlugin — registry integration", () => {
  it("registers each marked element in an injected registry", () => {
    const registry = new SourceRegistry();
    const plugin = devPlugin({ registry });
    transform(plugin, 'export const X = () => <div className="c">t</div>;', id("src/App.tsx"));

    expect(registry.size).toBe(1);
    const entries = registry.listByFile("src/App.tsx");
    expect(entries.length).toBe(1);
    expect(entries[0]?.componentName).toBe("div");
    expect(entries[0]?.staticClassName).toBe("c");
    expect(entries[0]?.staticText).toBe("t");
  });

  it("HMR clears the registry for the updated file", () => {
    const registry = new SourceRegistry();
    const plugin = devPlugin({ registry });
    transform(plugin, "export const X = () => <div />;", id("src/App.tsx"));
    expect(registry.size).toBe(1);

    callable(plugin).handleHotUpdate?.({ file: id("src/App.tsx") });
    expect(registry.size).toBe(0);
  });

  it("collision resistance: two distinct elements get distinct source ids", () => {
    const registry = new SourceRegistry();
    const plugin = devPlugin({ registry });
    // Two structurally different elements at the same line range prefix:
    transform(
      plugin,
      'export const X = ({n}) => n ? <div className="a">one</div> : <span className="b">two</span>;',
      id("src/Ternary.tsx"),
    );
    expect(registry.size).toBe(2);
    const ids = registry.listByFile("src/Ternary.tsx").map((e) => e.sourceId);
    expect(new Set(ids).size).toBe(2);
  });
});
