import { createSourceEntry, SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";

import { createSvelteAdapter, SVELTE_ADAPTER } from "./adapter.js";
import type { SvelteRouteSegmentInfo } from "./types.js";

const makeEntry = (
  overrides: Partial<{
    sourceId: string;
    workspaceRelativePath: string;
    componentName: string;
    staticClassName: string;
  }> = {},
) =>
  createSourceEntry({
    sourceId: overrides.sourceId ?? "svelte-xyz789",
    workspaceRelativePath: overrides.workspaceRelativePath ?? "src/App.svelte",
    range: { startLine: 2, startColumn: 0, endLine: 2, endColumn: 15 },
    componentName: overrides.componentName ?? "App",
    ...(overrides.staticClassName !== undefined
      ? { staticClassName: overrides.staticClassName }
      : {}),
    fingerprint: "fp-svelte-aaa",
    registeredAt: 1000,
  });

describe("adapter — SVELTE_ADAPTER singleton", () => {
  it("returns no candidates when no lookup data is loaded", () => {
    const candidates = SVELTE_ADAPTER.resolve({
      identity: { sourceId: "svelte-xyz789", fingerprint: "fp" },
    });
    expect(candidates).toEqual([]);
  });

  it("returns no candidates when identity is missing", () => {
    const adapter = createSvelteAdapter({ lookup: () => makeEntry() });
    expect(adapter.resolve({})).toEqual([]);
  });

  it("returns no candidates when sourceId is missing", () => {
    const adapter = createSvelteAdapter({ lookup: () => makeEntry() });
    expect(adapter.resolve({ identity: { fingerprint: "fp" } })).toEqual([]);
  });
});

describe("adapter — createSvelteAdapter with marker data", () => {
  it("returns HIGH candidate with marker evidence when marker resolves", () => {
    const entry = makeEntry();
    const adapter = createSvelteAdapter({
      lookup: (id) => (id === "svelte-xyz789" ? entry : undefined),
    });
    const candidates = adapter.resolve({
      identity: { sourceId: "svelte-xyz789", fingerprint: "fp-svelte-aaa" },
    });
    expect(candidates.length).toBe(1);
    const candidate = candidates[0];
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.evidence).toEqual(["marker"]);
    expect(candidate?.workspaceRelativePath).toBe("src/App.svelte");
    expect(candidate?.sourceId).toBe("svelte-xyz789");
    expect(candidate?.componentName).toBe("App");
  });

  it("returns no candidates when marker does not resolve in registry", () => {
    const adapter = createSvelteAdapter({ lookup: () => undefined });
    const candidates = adapter.resolve({
      identity: { sourceId: "unknown", fingerprint: "fp" },
    });
    expect(candidates).toEqual([]);
  });

  it("preserves staticClassName from the registry entry", () => {
    const entry = makeEntry({ staticClassName: "card" });
    const adapter = createSvelteAdapter({ lookup: () => entry });
    const candidate = adapter.resolve({
      identity: { sourceId: "svelte-xyz789", fingerprint: "fp" },
    })[0];
    expect(candidate?.staticClassName).toBe("card");
  });
});

describe("adapter — route segment metadata", () => {
  it("adds route segment info to warnings", () => {
    const entry = makeEntry({ workspaceRelativePath: "src/routes/about/+page.svelte" });
    const segment: SvelteRouteSegmentInfo = {
      workspaceRelativePath: "src/routes/about/+page.svelte",
      segment: "about",
      fileName: "+page.svelte",
    };
    const adapter = createSvelteAdapter({ lookup: () => entry, routeSegments: [segment] });
    const candidate = adapter.resolve({
      identity: { sourceId: "svelte-xyz789", fingerprint: "fp" },
    })[0];
    expect(candidate?.warnings.some((w) => w.includes("route segment"))).toBe(true);
    expect(candidate?.warnings.some((w) => w.includes("about"))).toBe(true);
  });
});

describe("adapter — repeated instance ambiguity", () => {
  it("downgrades to MEDIUM when runtimeInstanceCount > threshold", () => {
    const entry = makeEntry();
    const adapter = createSvelteAdapter({
      lookup: () => entry,
      repeatedInstanceThreshold: 1,
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "svelte-xyz789", fingerprint: "fp" },
      runtimeInstanceCount: 5,
    })[0];
    expect(candidate?.confidence).toBe("medium");
    expect(candidate?.warnings.some((w) => w.includes("repeated instance"))).toBe(true);
  });

  it("stays HIGH when runtimeInstanceCount equals threshold", () => {
    const entry = makeEntry();
    const adapter = createSvelteAdapter({
      lookup: () => entry,
      repeatedInstanceThreshold: 1,
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "svelte-xyz789", fingerprint: "fp" },
      runtimeInstanceCount: 1,
    })[0];
    expect(candidate?.confidence).toBe("high");
  });
});

describe("adapter — integration with SourceRegistry", () => {
  it("resolves via a real SourceRegistry lookup", () => {
    const registry = new SourceRegistry();
    const entry = makeEntry({ sourceId: "real-svelte-marker-1" });
    registry.register(entry);

    const adapter = createSvelteAdapter({ lookup: (id) => registry.lookup(id) });
    const candidate = adapter.resolve({
      identity: { sourceId: "real-svelte-marker-1", fingerprint: "fp-svelte-aaa" },
    })[0];
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.workspaceRelativePath).toBe("src/App.svelte");
  });
});
