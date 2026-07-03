import { createSourceEntry, SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";

import { createVueAdapter, VUE_ADAPTER } from "./adapter.js";
import type { VueRouteSegmentInfo } from "./types.js";

const makeEntry = (
  overrides: Partial<{
    sourceId: string;
    workspaceRelativePath: string;
    componentName: string;
    staticClassName: string;
  }> = {},
) =>
  createSourceEntry({
    sourceId: overrides.sourceId ?? "vue-abc123",
    workspaceRelativePath: overrides.workspaceRelativePath ?? "src/App.vue",
    range: { startLine: 3, startColumn: 2, endLine: 3, endColumn: 18 },
    componentName: overrides.componentName ?? "App",
    ...(overrides.staticClassName !== undefined
      ? { staticClassName: overrides.staticClassName }
      : {}),
    fingerprint: "fp-vue-aaa",
    registeredAt: 1000,
  });

describe("adapter — VUE_ADAPTER singleton", () => {
  it("returns no candidates when no lookup data is loaded", () => {
    const candidates = VUE_ADAPTER.resolve({
      identity: { sourceId: "vue-abc123", fingerprint: "fp" },
    });
    expect(candidates).toEqual([]);
  });

  it("returns no candidates when identity is missing", () => {
    const adapter = createVueAdapter({ lookup: () => makeEntry() });
    expect(adapter.resolve({})).toEqual([]);
  });

  it("returns no candidates when sourceId is missing", () => {
    const adapter = createVueAdapter({ lookup: () => makeEntry() });
    expect(adapter.resolve({ identity: { fingerprint: "fp" } })).toEqual([]);
  });
});

describe("adapter — createVueAdapter with marker data", () => {
  it("returns HIGH candidate with marker evidence when marker resolves", () => {
    const entry = makeEntry();
    const adapter = createVueAdapter({ lookup: (id) => (id === "vue-abc123" ? entry : undefined) });
    const candidates = adapter.resolve({
      identity: { sourceId: "vue-abc123", fingerprint: "fp-vue-aaa" },
    });
    expect(candidates.length).toBe(1);
    const candidate = candidates[0];
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.evidence).toEqual(["marker"]);
    expect(candidate?.workspaceRelativePath).toBe("src/App.vue");
    expect(candidate?.sourceId).toBe("vue-abc123");
    expect(candidate?.componentName).toBe("App");
  });

  it("returns no candidates when marker does not resolve in registry", () => {
    const adapter = createVueAdapter({ lookup: () => undefined });
    const candidates = adapter.resolve({
      identity: { sourceId: "unknown", fingerprint: "fp" },
    });
    expect(candidates).toEqual([]);
  });

  it("includes source range from the registry entry", () => {
    const entry = makeEntry();
    const adapter = createVueAdapter({ lookup: () => entry });
    const candidate = adapter.resolve({
      identity: { sourceId: "vue-abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.startLine).toBe(3);
    expect(candidate?.startColumn).toBe(2);
    expect(candidate?.endLine).toBe(3);
    expect(candidate?.endColumn).toBe(18);
  });

  it("preserves staticClassName from the registry entry", () => {
    const entry = makeEntry({ staticClassName: "btn-primary" });
    const adapter = createVueAdapter({ lookup: () => entry });
    const candidate = adapter.resolve({
      identity: { sourceId: "vue-abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.staticClassName).toBe("btn-primary");
  });
});

describe("adapter — route segment metadata", () => {
  it("adds route segment info to warnings", () => {
    const entry = makeEntry({ workspaceRelativePath: "src/views/Home.vue" });
    const segment: VueRouteSegmentInfo = {
      workspaceRelativePath: "src/views/Home.vue",
      segment: "Home",
      fileName: "Home.vue",
    };
    const adapter = createVueAdapter({ lookup: () => entry, routeSegments: [segment] });
    const candidate = adapter.resolve({
      identity: { sourceId: "vue-abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.warnings.some((w) => w.includes("route segment"))).toBe(true);
    expect(candidate?.warnings.some((w) => w.includes("Home"))).toBe(true);
  });
});

describe("adapter — repeated instance ambiguity", () => {
  it("downgrades to MEDIUM when runtimeInstanceCount > threshold", () => {
    const entry = makeEntry();
    const adapter = createVueAdapter({
      lookup: () => entry,
      repeatedInstanceThreshold: 1,
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "vue-abc123", fingerprint: "fp" },
      runtimeInstanceCount: 3,
    })[0];
    expect(candidate?.confidence).toBe("medium");
    expect(candidate?.warnings.some((w) => w.includes("repeated instance"))).toBe(true);
  });

  it("stays HIGH when runtimeInstanceCount equals threshold", () => {
    const entry = makeEntry();
    const adapter = createVueAdapter({
      lookup: () => entry,
      repeatedInstanceThreshold: 1,
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "vue-abc123", fingerprint: "fp" },
      runtimeInstanceCount: 1,
    })[0];
    expect(candidate?.confidence).toBe("high");
  });
});

describe("adapter — integration with SourceRegistry", () => {
  it("resolves via a real SourceRegistry lookup", () => {
    const registry = new SourceRegistry();
    const entry = makeEntry({ sourceId: "real-vue-marker-1" });
    registry.register(entry);

    const adapter = createVueAdapter({ lookup: (id) => registry.lookup(id) });
    const candidate = adapter.resolve({
      identity: { sourceId: "real-vue-marker-1", fingerprint: "fp-vue-aaa" },
    })[0];
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.workspaceRelativePath).toBe("src/App.vue");
  });
});
