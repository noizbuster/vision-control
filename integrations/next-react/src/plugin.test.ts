import { SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";

import {
  detectBoundaries,
  detectRouteSegment,
  injectNextMarkers,
  isNextProduction,
  registerMarkerEntries,
  withVisionControlSourceMarkers,
} from "./plugin.js";

const transform = (
  code: string,
  filePath = "app/page.tsx",
  workspaceRoot = "/workspace",
): ReturnType<typeof injectNextMarkers> =>
  injectNextMarkers({
    code,
    filePath: `${workspaceRoot}/${filePath}`,
    workspaceRoot,
    include: ["**/*.{jsx,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  });

describe("plugin — injectNextMarkers", () => {
  it("injects data-vc-source on JSX elements", () => {
    const code = "export default function Page() { return <div>Hello</div>; }";
    const result = transform(code);
    expect(result).toBeDefined();
    expect(result?.code).toContain("data-vc-source=");
    expect(result?.entries.length).toBe(1);
  });

  it("injects markers on multiple elements", () => {
    const code =
      "export default function Page() { return <div><span>hi</span><button>click</button></div>; }";
    const result = transform(code);
    expect(result?.entries.length).toBe(3);
    const markers = result?.code.match(/data-vc-source="/g);
    expect(markers?.length).toBe(3);
  });

  it("does not inject on already-marked elements", () => {
    const code = `<div data-vc-source="existing"></div>`;
    const result = transform(code);
    expect(result?.entries.length).toBe(0);
  });

  it("skips non-JSX files", () => {
    const code = "export const x = 1;";
    const result = transform(code, "lib/utils.ts");
    expect(result).toBeUndefined();
  });

  it("skips excluded files", () => {
    const result = injectNextMarkers({
      code: "<div>x</div>",
      filePath: "/workspace/node_modules/pkg/comp.tsx",
      workspaceRoot: "/workspace",
      include: ["**/*.{jsx,tsx}"],
      exclude: ["node_modules/**"],
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined on parse failure (graceful)", () => {
    const result = injectNextMarkers({
      code: "<<<<invalid jsx>>>>",
      filePath: "/workspace/app/page.tsx",
      workspaceRoot: "/workspace",
      include: ["**/*.{jsx,tsx}"],
      exclude: ["node_modules/**"],
    });
    expect(result).toBeUndefined();
  });

  it("marker tokens are opaque (no file path leakage)", () => {
    const code = "<div>hello</div>";
    const result = transform(code, "app/page.tsx");
    expect(result).toBeDefined();
    const token = result?.entries[0]?.sourceId;
    expect(token).toBeDefined();
    expect(token).not.toContain("/");
    expect(token).not.toContain("\\");
    expect(token).not.toContain("page");
    expect(token).not.toContain("app");
    expect(token).not.toContain("workspace");
  });

  it("markers are deterministic (same input -> same token)", () => {
    const code = '<div className="card">Hello</div>';
    const r1 = transform(code, "app/page.tsx");
    const r2 = transform(code, "app/page.tsx");
    expect(r1?.entries[0]?.sourceId).toBe(r2?.entries[0]?.sourceId);
  });

  it("different elements produce different tokens", () => {
    const code =
      'export default function Page() { return <div className="a">A</div>; }\nexport function Side() { return <span className="b">B</span>; }';
    const result = transform(code);
    const ids = result?.entries.map((e) => e.sourceId);
    expect(ids).toBeDefined();
    expect(ids?.[0]).not.toBe(ids?.[1]);
  });

  it("registers workspace-relative paths (never absolute)", () => {
    const code = "<div>x</div>";
    const result = transform(code, "app/page.tsx");
    expect(result?.entries[0]?.workspaceRelativePath).toBe("app/page.tsx");
    expect(result?.entries[0]?.workspaceRelativePath).not.toContain("/workspace");
  });
});

describe("plugin — boundary detection", () => {
  it("detects use client directive", () => {
    const code = '"use client";\nexport function Client() { return <div />; }';
    const result = transform(code);
    expect(result?.boundaries.length).toBe(1);
    expect(result?.boundaries[0]?.directive).toBe("use client");
    expect(result?.boundaries[0]?.line).toBe(1);
  });

  it("detects use server directive", () => {
    const code = '"use server";\nexport function Server() { return <div />; }';
    const result = transform(code);
    expect(result?.boundaries.length).toBe(1);
    expect(result?.boundaries[0]?.directive).toBe("use server");
  });

  it("returns empty boundaries when no directive present", () => {
    const code = "export function C() { return <div />; }";
    const result = transform(code);
    expect(result?.boundaries).toEqual([]);
  });

  it("detectBoundaries works standalone on code without JSX", () => {
    const boundaries = detectBoundaries('"use client";\nconst x = 1;', "app/c.tsx");
    expect(boundaries.length).toBe(1);
    expect(boundaries[0]?.directive).toBe("use client");
  });
});

describe("plugin — route segment detection", () => {
  it("detects app router page segment", () => {
    const seg = detectRouteSegment("app/page.tsx");
    expect(seg?.routerType).toBe("app");
    expect(seg?.segment).toBe("page");
  });

  it("detects app router nested layout segment", () => {
    const seg = detectRouteSegment("app/blog/layout.tsx");
    expect(seg?.routerType).toBe("app");
    expect(seg?.segment).toBe("layout");
  });

  it("detects pages router route", () => {
    const seg = detectRouteSegment("pages/about.tsx");
    expect(seg?.routerType).toBe("pages");
    expect(seg?.segment).toBe("about");
  });

  it("returns undefined for non-route files", () => {
    expect(detectRouteSegment("components/Button.tsx")).toBeUndefined();
  });

  it("records route segment in transform result", () => {
    const result = transform("<div />", "app/page.tsx");
    expect(result?.routeSegment?.routerType).toBe("app");
    expect(result?.routeSegment?.segment).toBe("page");
  });
});

describe("plugin — production gate", () => {
  it("isNextProduction returns true when NODE_ENV=production", () => {
    expect(isNextProduction(undefined, { NODE_ENV: "production" })).toBe(true);
  });

  it("isNextProduction returns false when NODE_ENV=development", () => {
    expect(isNextProduction(undefined, { NODE_ENV: "development" })).toBe(false);
  });

  it("isNextProduction returns true when explicit production flag set", () => {
    expect(isNextProduction({ production: true }, { NODE_ENV: "development" })).toBe(true);
  });

  it("withVisionControlSourceMarkers returns config unchanged in production", () => {
    const userConfig = { reactStrictMode: true, webpack: () => ({}) };
    const wrapped = withVisionControlSourceMarkers(userConfig, {
      production: true,
    });
    expect(wrapped).toBe(userConfig);
    expect(wrapped.webpack).toBe(userConfig.webpack);
  });

  it("withVisionControlSourceMarkers wraps webpack in dev mode", () => {
    const userConfig = { reactStrictMode: true };
    const wrapped = withVisionControlSourceMarkers(userConfig, {});
    expect(wrapped.webpack).toBeDefined();
    expect(typeof wrapped.webpack).toBe("function");
    expect(wrapped.reactStrictMode).toBe(true);
  });

  it("withVisionControlSourceMarkers registers turbopack rules in dev mode", () => {
    const wrapped = withVisionControlSourceMarkers({ reactStrictMode: true }, {});
    expect(wrapped.turbopack).toBeDefined();
    const rules = (wrapped.turbopack as { rules?: Record<string, unknown> }).rules;
    expect(rules).toBeDefined();
    expect(rules?.["*.tsx"]).toBeDefined();
    expect(rules?.["*.jsx"]).toBeDefined();
  });

  it("turbopack marker rules reference the loader with options", () => {
    const wrapped = withVisionControlSourceMarkers({}, { workspaceRoot: "/ws" });
    const rules = (wrapped.turbopack as { rules?: Record<string, unknown> }).rules;
    const tsxRule = rules?.["*.tsx"] as {
      loaders: Array<{ loader: string; options: Record<string, unknown> }>;
    };
    expect(tsxRule.loaders.length).toBe(1);
    expect(tsxRule.loaders[0]?.loader).toContain("loader.js");
    expect(tsxRule.loaders[0]?.options.workspaceRoot).toBe("/ws");
  });

  it("turbopack rules do not set `as` (avoids extension doubling)", () => {
    const wrapped = withVisionControlSourceMarkers({}, {});
    const rules = (wrapped.turbopack as { rules?: Record<string, unknown> }).rules;
    const tsxRule = rules?.["*.tsx"] as { as?: string };
    expect(tsxRule.as).toBeUndefined();
  });

  it("turbopack field is absent in production", () => {
    const wrapped = withVisionControlSourceMarkers({ reactStrictMode: true }, { production: true });
    expect(wrapped.turbopack).toBeUndefined();
  });

  it("preserves user turbopack resolveAlias + non-marker rules", () => {
    const userTurbopack = {
      resolveAlias: { "my-pkg": "./aliased" },
      rules: { "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" } },
    };
    const wrapped = withVisionControlSourceMarkers({ turbopack: userTurbopack }, {});
    const turbo = wrapped.turbopack as {
      resolveAlias?: Record<string, string>;
      rules?: Record<string, unknown>;
    };
    expect(turbo.resolveAlias?.["my-pkg"]).toBe("./aliased");
    expect(turbo.rules?.["*.svg"]).toBeDefined();
    expect(turbo.rules?.["*.tsx"]).toBeDefined();
    expect(turbo.rules?.["*.jsx"]).toBeDefined();
  });

  it("webpack wrapper adds marker rule in dev context", () => {
    const wrapped = withVisionControlSourceMarkers({}, {});
    const config = wrapped.webpack?.({ module: { rules: [] } }, { dev: true }) as {
      module?: { rules?: unknown[] };
    };
    const rules = config?.module?.rules;
    expect(rules).toBeDefined();
    expect(rules?.length).toBe(2);
    const markerRule = rules?.[1] as { test: RegExp; enforce: string };
    expect(markerRule.test.test("page.tsx")).toBe(true);
    expect(markerRule.enforce).toBe("pre");
  });

  it("webpack wrapper does not add rule in non-dev context", () => {
    const wrapped = withVisionControlSourceMarkers({}, {});
    const config = wrapped.webpack?.({ module: { rules: [] } }, { dev: false }) as {
      module?: { rules?: unknown[] };
    };
    const rules = config?.module?.rules;
    expect(rules?.length).toBe(0);
  });

  it("webpack wrapper preserves user webpack modifications", () => {
    const userWebpack = (config: Record<string, unknown>) => ({
      ...config,
      customField: true,
    });
    const wrapped = withVisionControlSourceMarkers({ webpack: userWebpack }, {});
    const config = wrapped.webpack?.({ module: { rules: [] } }, { dev: true }) as {
      module?: { rules?: unknown[] };
      customField?: boolean;
    };
    expect(config?.customField).toBe(true);
    const rules = config?.module?.rules;
    expect(rules?.length).toBe(2);
  });
});

describe("plugin — registerMarkerEntries", () => {
  it("registers entries in a registry", () => {
    const registry = new SourceRegistry();
    const result = transform("<div>hi</div>", "app/page.tsx");
    expect(result).toBeDefined();
    registerMarkerEntries(registry, "app/page.tsx", result?.entries ?? []);
    const entry = registry.lookup(result?.entries[0]?.sourceId ?? "");
    expect(entry).toBeDefined();
    expect(entry?.workspaceRelativePath).toBe("app/page.tsx");
  });

  it("clears stale entries for the same file on re-register", () => {
    const registry = new SourceRegistry();
    const r1 = transform("<div>hi</div>", "app/page.tsx");
    registerMarkerEntries(registry, "app/page.tsx", r1?.entries ?? []);
    const r2 = transform("<span>bye</span>", "app/page.tsx");
    registerMarkerEntries(registry, "app/page.tsx", r2?.entries ?? []);
    const stale = registry.lookup(r1?.entries[0]?.sourceId ?? "");
    expect(stale).toBeUndefined();
    const fresh = registry.lookup(r2?.entries[0]?.sourceId ?? "");
    expect(fresh).toBeDefined();
  });
});
