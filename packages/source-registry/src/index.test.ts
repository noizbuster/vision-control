import { describe, expect, it } from "vitest";

import { applyHmrUpdate } from "./hmr-updates.js";
import { SourceRegistry } from "./registry.js";
import { createSourceEntry, type SourceEntry } from "./types.js";

const entry = (overrides: Partial<SourceEntry> & { sourceId: string }): SourceEntry =>
  createSourceEntry({
    workspaceRelativePath: "src/App.tsx",
    range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 10 },
    componentName: "div",
    fingerprint: "fp-a",
    ...overrides,
  });

describe("SourceRegistry CRUD", () => {
  it("registers and looks up by source id", () => {
    const reg = new SourceRegistry();
    const e = reg.register(entry({ sourceId: "s1" }));
    expect(e.sourceId).toBe("s1");
    expect(reg.lookup("s1")?.componentName).toBe("div");
    expect(reg.lookup("missing")).toBeUndefined();
    expect(reg.size).toBe(1);
  });

  it("replaces an entry when the same source id is re-registered", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s1", componentName: "div" }));
    reg.register(entry({ sourceId: "s1", componentName: "span" }));
    expect(reg.size).toBe(1);
    expect(reg.lookup("s1")?.componentName).toBe("span");
  });

  it("lists all entries for one file", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s1" }));
    reg.register(entry({ sourceId: "s2" }));
    expect(
      reg
        .listByFile("src/App.tsx")
        .map((e) => e.sourceId)
        .sort(),
    ).toEqual(["s1", "s2"]);
    expect(reg.listByFile("src/Other.tsx")).toEqual([]);
  });

  it("clears everything", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s1" }));
    reg.bindRuntime("r1", "s1");
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.runtimeCount).toBe(0);
    expect(reg.lookupByElement("r1")).toBeUndefined();
  });
});

describe("SourceRegistry absolute-path guard", () => {
  it("rejects an absolute POSIX path in workspaceRelativePath", () => {
    const reg = new SourceRegistry();
    expect(() =>
      reg.register(entry({ sourceId: "s1", workspaceRelativePath: "/home/user/src/App.tsx" })),
    ).toThrow();
  });

  it("rejects an absolute Windows path in workspaceRelativePath", () => {
    const reg = new SourceRegistry();
    expect(() =>
      reg.register(entry({ sourceId: "s1", workspaceRelativePath: "C:\\src\\App.tsx" })),
    ).toThrow();
  });

  it("rejects a non-opaque source id that embeds a path separator", () => {
    const reg = new SourceRegistry();
    expect(() => reg.register(entry({ sourceId: "src/App.tsx:1:0" }))).toThrow();
  });
});

describe("SourceRegistry runtime bindings", () => {
  it("resolves a runtime id back to its source entry", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s1" }));
    reg.bindRuntime("r1", "s1");
    expect(reg.lookupByElement("r1")?.sourceId).toBe("s1");
  });

  it("keeps DISTINCT runtime ids for repeated instances of one source id", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s-card" }));
    for (const rt of ["r-1", "r-2", "r-3", "r-4", "r-5"]) reg.bindRuntime(rt, "s-card");
    expect(reg.size).toBe(1);
    expect(reg.runtimeCount).toBe(5);
    const resolved = ["r-1", "r-2", "r-3", "r-4", "r-5"].map(
      (rt) => reg.lookupByElement(rt)?.sourceId,
    );
    expect(resolved).toEqual(["s-card", "s-card", "s-card", "s-card", "s-card"]);
  });

  it("returns undefined when the runtime id is bound but the source is not registered", () => {
    const reg = new SourceRegistry();
    reg.bindRuntime("r1", "s-missing");
    expect(reg.lookupByElement("r1")).toBeUndefined();
  });

  it("unbinds a runtime id", () => {
    const reg = new SourceRegistry();
    reg.bindRuntime("r1", "s1");
    expect(reg.unbindRuntime("r1")).toBe(true);
    expect(reg.unbindRuntime("r1")).toBe(false);
  });
});

describe("SourceRegistry HMR (clearForFile)", () => {
  it("drops all entries for a file and their runtime bindings", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s1", workspaceRelativePath: "src/App.tsx" }));
    reg.register(entry({ sourceId: "s2", workspaceRelativePath: "src/App.tsx" }));
    reg.register(entry({ sourceId: "s3", workspaceRelativePath: "src/Other.tsx" }));
    reg.bindRuntime("r1", "s1");
    reg.bindRuntime("r2", "s3");

    const removed = reg.clearForFile("src/App.tsx");
    expect(removed).toBe(2);
    expect(reg.lookup("s1")).toBeUndefined();
    expect(reg.lookup("s2")).toBeUndefined();
    expect(reg.lookup("s3")?.sourceId).toBe("s3");
    expect(reg.lookupByElement("r1")).toBeUndefined();
    expect(reg.lookupByElement("r2")?.sourceId).toBe("s3");
  });

  it("reports zero removals for an unknown file", () => {
    const reg = new SourceRegistry();
    expect(reg.clearForFile("src/Nope.tsx")).toBe(0);
  });
});

describe("SourceRegistry serialization", () => {
  it("round-trips through serialize/deserialize", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s1", staticClassName: "card" }));
    const blob = reg.serialize();

    const fresh = new SourceRegistry();
    fresh.deserialize(blob);
    expect(fresh.size).toBe(1);
    expect(fresh.lookup("s1")?.staticClassName).toBe("card");
  });

  it("deserialize rejects an absolute path in the blob", () => {
    const reg = new SourceRegistry();
    expect(() =>
      reg.deserialize({
        version: 1,
        entries: [entry({ sourceId: "s1", workspaceRelativePath: "/abs/path.tsx" })],
      }),
    ).toThrow();
  });

  it("deserialize mirrors exactly (clears prior contents)", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "old" }));
    reg.deserialize({ version: 1, entries: [entry({ sourceId: "new" })] });
    expect(reg.lookup("old")).toBeUndefined();
    expect(reg.lookup("new")?.sourceId).toBe("new");
  });
});

describe("applyHmrUpdate", () => {
  it("clears stale entries for the file then registers the fresh set", () => {
    const reg = new SourceRegistry();
    reg.register(entry({ sourceId: "s-old", workspaceRelativePath: "src/App.tsx" }));
    reg.bindRuntime("r-old", "s-old");

    const result = applyHmrUpdate(reg, {
      workspaceRelativePath: "src/App.tsx",
      entries: [
        entry({ sourceId: "s-new-a", workspaceRelativePath: "src/App.tsx" }),
        entry({ sourceId: "s-new-b", workspaceRelativePath: "src/App.tsx" }),
      ],
    });

    expect(result).toEqual({ removed: 1, registered: 2 });
    expect(reg.lookup("s-old")).toBeUndefined();
    expect(reg.lookupByElement("r-old")).toBeUndefined();
    expect(
      reg
        .listByFile("src/App.tsx")
        .map((e) => e.sourceId)
        .sort(),
    ).toEqual(["s-new-a", "s-new-b"]);
  });
});
