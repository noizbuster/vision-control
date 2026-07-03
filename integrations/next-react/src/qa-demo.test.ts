import { SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";

import {
  assertHydrationSafe,
  createNextAdapter,
  detectTurbopack,
  injectNextMarkers,
  isNextProduction,
  NEXT_ADAPTER,
  withVisionControlSourceMarkers,
} from "./index.js";

describe("VC-V1V2-13 QA demonstration", () => {
  it("demonstrates full dev-mode marker lifecycle", () => {
    const code =
      '"use client";\nexport function Button() { return <button className="btn">Click</button>; }';
    const result = injectNextMarkers({
      code,
      filePath: "/workspace/app/Button.tsx",
      workspaceRoot: "/workspace",
      include: ["**/*.{jsx,tsx}"],
      exclude: ["node_modules/**", ".next/**"],
    });

    expect(result).toBeDefined();
    const r = result;
    if (r === undefined) throw new Error("transform returned undefined");
    expect(r.entries.length).toBe(1);
    expect(r.entries[0]?.sourceId).not.toContain("/");
    expect(r.boundaries[0]?.directive).toBe("use client");
    expect(r.routeSegment?.segment).toBe("Button");

    const registry = new SourceRegistry();
    for (const e of r.entries) registry.register(e);
    const sourceId = r.entries[0]?.sourceId;
    if (sourceId === undefined) throw new Error("no sourceId");
    const adapter = createNextAdapter({
      lookup: (id: string) => registry.lookup(id),
      ...(r.boundaries.length > 0 ? { boundaries: r.boundaries } : {}),
    });
    const candidate = adapter.resolve({
      identity: { sourceId, fingerprint: "fp" },
    })[0];

    expect(candidate?.confidence).toBe("high");
    expect(candidate?.evidence).toEqual(["marker"]);
    expect(candidate?.warnings.some((w) => w.includes("use client"))).toBe(true);
  });

  it("demonstrates hydration safety (deterministic markers)", () => {
    const opts = {
      code: '<div className="a">A</div>',
      filePath: "/workspace/app/p.tsx",
      workspaceRoot: "/workspace",
      include: ["**/*.{jsx,tsx}"],
      exclude: [] as readonly string[],
    };
    const r1 = injectNextMarkers(opts);
    const r2 = injectNextMarkers(opts);
    expect(r1?.entries[0]?.sourceId).toBe(r2?.entries[0]?.sourceId);

    const id = r1?.entries[0]?.sourceId;
    if (id === undefined) throw new Error("no marker");
    const hydration = assertHydrationSafe({
      serverHtml: `<div data-vc-source="${id}"></div>`,
      clientHtml: `<div data-vc-source="${id}"></div>`,
    });
    expect(hydration.safe).toBe(true);
  });

  it("demonstrates Turbopack diagnostic", () => {
    const turbo = detectTurbopack({ env: { TURBOPACK: "1" }, argv: [] });
    expect(turbo.detected).toBe(true);
    expect(turbo.diagnostic).toContain("not yet supported");
    expect(turbo.diagnostic).toContain("webpack/Babel");

    const webpack = detectTurbopack({ env: {}, argv: [] });
    expect(webpack.detected).toBe(false);
  });

  it("demonstrates production gate", () => {
    expect(isNextProduction(undefined, { NODE_ENV: "production" })).toBe(true);
    const config = { reactStrictMode: true };
    const wrapped = withVisionControlSourceMarkers(config, { production: true });
    expect(wrapped).toBe(config);
  });

  it("singleton NEXT_ADAPTER defers when no data", () => {
    const result = NEXT_ADAPTER.resolve({ identity: { sourceId: "x", fingerprint: "fp" } });
    expect(result).toEqual([]);
  });
});
