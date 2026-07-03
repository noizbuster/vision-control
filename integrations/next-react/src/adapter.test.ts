import { createSourceEntry, SourceRegistry } from "@vision-control/source-registry";
import { describe, expect, it } from "vitest";

import { createNextAdapter, NEXT_ADAPTER } from "./adapter.js";
import type { RouteSegmentInfo, ServerClientBoundary } from "./types.js";

const makeEntry = (
  overrides: Partial<{
    sourceId: string;
    workspaceRelativePath: string;
    componentName: string;
  }> = {},
) =>
  createSourceEntry({
    sourceId: overrides.sourceId ?? "abc123",
    workspaceRelativePath: overrides.workspaceRelativePath ?? "app/page.tsx",
    range: { startLine: 5, startColumn: 8, endLine: 5, endColumn: 20 },
    componentName: overrides.componentName ?? "Page",
    fingerprint: "fp-aaa",
    registeredAt: 1000,
  });

describe("adapter — NEXT_ADAPTER singleton", () => {
  it("returns no candidates when no lookup data is loaded", () => {
    const candidates = NEXT_ADAPTER.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
    });
    expect(candidates).toEqual([]);
  });

  it("returns no candidates when identity is missing", () => {
    const adapter = createNextAdapter({
      lookup: () => makeEntry(),
    });
    expect(adapter.resolve({})).toEqual([]);
  });

  it("returns no candidates when sourceId is missing", () => {
    const adapter = createNextAdapter({
      lookup: () => makeEntry(),
    });
    expect(adapter.resolve({ identity: { fingerprint: "fp" } })).toEqual([]);
  });
});

describe("adapter — createNextAdapter with marker data", () => {
  it("returns HIGH candidate with marker evidence when marker resolves", () => {
    const entry = makeEntry();
    const adapter = createNextAdapter({
      lookup: (id) => (id === "abc123" ? entry : undefined),
    });
    const candidates = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp-aaa" },
    });
    expect(candidates.length).toBe(1);
    const candidate = candidates[0];
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.evidence).toEqual(["marker"]);
    expect(candidate?.workspaceRelativePath).toBe("app/page.tsx");
    expect(candidate?.sourceId).toBe("abc123");
    expect(candidate?.componentName).toBe("Page");
  });

  it("returns no candidates when marker does not resolve in registry", () => {
    const adapter = createNextAdapter({
      lookup: () => undefined,
    });
    const candidates = adapter.resolve({
      identity: { sourceId: "unknown", fingerprint: "fp" },
    });
    expect(candidates).toEqual([]);
  });

  it("includes source range from the registry entry", () => {
    const entry = makeEntry();
    const adapter = createNextAdapter({
      lookup: () => entry,
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.startLine).toBe(5);
    expect(candidate?.startColumn).toBe(8);
    expect(candidate?.endLine).toBe(5);
    expect(candidate?.endColumn).toBe(20);
  });
});

describe("adapter — server/client boundary metadata", () => {
  it("adds boundary warning when element is in a use client module", () => {
    const entry = makeEntry({ workspaceRelativePath: "app/ClientCmp.tsx" });
    const boundary: ServerClientBoundary = {
      workspaceRelativePath: "app/ClientCmp.tsx",
      directive: "use client",
      line: 1,
      column: 0,
    };
    const adapter = createNextAdapter({
      lookup: () => entry,
      boundaries: [boundary],
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.warnings.some((w) => w.includes("use client"))).toBe(true);
    expect(candidate?.ownershipRisk).toBe("low");
  });

  it("adds boundary warning for use server modules", () => {
    const entry = makeEntry({ workspaceRelativePath: "app/actions.ts" });
    const boundary: ServerClientBoundary = {
      workspaceRelativePath: "app/actions.ts",
      directive: "use server",
      line: 1,
      column: 0,
    };
    const adapter = createNextAdapter({
      lookup: () => entry,
      boundaries: [boundary],
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.warnings.some((w) => w.includes("use server"))).toBe(true);
  });

  it("does not add boundary warning when no boundary matches", () => {
    const entry = makeEntry({ workspaceRelativePath: "app/page.tsx" });
    const boundary: ServerClientBoundary = {
      workspaceRelativePath: "app/other.tsx",
      directive: "use client",
      line: 1,
      column: 0,
    };
    const adapter = createNextAdapter({
      lookup: () => entry,
      boundaries: [boundary],
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.warnings.some((w) => w.includes("use client"))).toBe(false);
    expect(candidate?.ownershipRisk).toBe("none");
  });
});

describe("adapter — route segment metadata", () => {
  it("adds route segment info to warnings", () => {
    const entry = makeEntry({ workspaceRelativePath: "app/page.tsx" });
    const segment: RouteSegmentInfo = {
      workspaceRelativePath: "app/page.tsx",
      segment: "page",
      routerType: "app",
      fileName: "page.tsx",
    };
    const adapter = createNextAdapter({
      lookup: () => entry,
      routeSegments: [segment],
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
    })[0];
    expect(candidate?.warnings.some((w) => w.includes("route segment"))).toBe(true);
    expect(candidate?.warnings.some((w) => w.includes("app router"))).toBe(true);
  });
});

describe("adapter — repeated instance ambiguity", () => {
  it("downgrades to MEDIUM when runtimeInstanceCount > threshold", () => {
    const entry = makeEntry();
    const adapter = createNextAdapter({
      lookup: () => entry,
      repeatedInstanceThreshold: 1,
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
      runtimeInstanceCount: 3,
    })[0];
    expect(candidate?.confidence).toBe("medium");
    expect(candidate?.warnings.some((w) => w.includes("repeated instance"))).toBe(true);
  });

  it("stays HIGH when runtimeInstanceCount equals threshold", () => {
    const entry = makeEntry();
    const adapter = createNextAdapter({
      lookup: () => entry,
      repeatedInstanceThreshold: 1,
    });
    const candidate = adapter.resolve({
      identity: { sourceId: "abc123", fingerprint: "fp" },
      runtimeInstanceCount: 1,
    })[0];
    expect(candidate?.confidence).toBe("high");
  });
});

describe("adapter — integration with SourceRegistry", () => {
  it("resolves via a real SourceRegistry lookup", () => {
    const registry = new SourceRegistry();
    const entry = makeEntry({ sourceId: "real-marker-1" });
    registry.register(entry);

    const adapter = createNextAdapter({
      lookup: (id) => registry.lookup(id),
    });

    const candidate = adapter.resolve({
      identity: { sourceId: "real-marker-1", fingerprint: "fp-aaa" },
    })[0];
    expect(candidate).toBeDefined();
    expect(candidate?.confidence).toBe("high");
    expect(candidate?.workspaceRelativePath).toBe("app/page.tsx");
  });
});
