import { describe, expect, it, vi } from "vitest";

import { resolveJsOrigins, scriptsFromElements } from "./resolve-js-origins.js";
import type { FetchLike, ScriptInput } from "./types.js";

const makeMapJson = (sources: readonly string[]): string =>
  JSON.stringify({
    version: 3,
    sources,
    sourcesContent: sources.map(() => "export const x = 1;\n"),
    mappings: "AAAA",
    names: [],
  });

const textResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });

describe("scriptsFromElements", () => {
  it("enumerates external and inline scripts, skipping empty nodes", () => {
    const inputs = scriptsFromElements([
      { src: "https://app.test/main.js", textContent: "" },
      { src: "", textContent: "console.log(1)\n//# sourceMappingURL=inline.js.map\n" },
      { src: "  ", textContent: null },
    ]);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.scriptSrc).toBe("https://app.test/main.js");
    expect(inputs[1]?.scriptText).toContain("sourceMappingURL");
  });
});

describe("resolveJsOrigins — happy path", () => {
  it("loads a script map and emits normalized module candidates", async () => {
    const mapBody = makeMapJson([
      "webpack://my-app/./src/App.tsx",
      "webpack://my-app/./src/Button.tsx",
      "webpack://my-app/./webpack/bootstrap",
    ]);
    const scriptBody = `console.log(1);\n//# sourceMappingURL=main.js.map\n`;

    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.endsWith("main.js") && !url.endsWith(".map")) {
        return textResponse(scriptBody);
      }
      if (url.endsWith("main.js.map")) {
        return textResponse(mapBody);
      }
      return textResponse("", 404);
    });

    const scripts: ScriptInput[] = [
      {
        scriptSrc: "https://app.test/assets/main.js",
      },
    ];

    const result = await resolveJsOrigins(scripts, { fetch: fetchImpl });

    expect(result.originsTruncated).toBe(false);
    expect(result.origins).toHaveLength(2);
    expect(result.origins.map((o) => o.relativePath).sort()).toEqual([
      "src/App.tsx",
      "src/Button.tsx",
    ]);
    const first = result.origins[0];
    expect(first?.kind).toBe("js");
    expect(first?.confidence).toBe("medium");
    expect(first?.warnings).toContain("module-path-only");
    expect(first?.sourceUrl).toBe("https://app.test/assets/main.js");
    expect(first?.mapUrl).toBe("https://app.test/assets/main.js.map");
    // Never HIGH without map+range (DOM→JSX HIGH forbidden).
    expect(result.origins.every((o) => o.confidence !== "high")).toBe(true);
  });

  it("uses provided scriptText without fetching the script body", async () => {
    const mapBody = makeMapJson(["webpack://./src/mod.ts"]);
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.endsWith("mod.js.map")) return textResponse(mapBody);
      return textResponse("", 404);
    });

    const result = await resolveJsOrigins(
      [
        {
          scriptSrc: "https://app.test/mod.js",
          scriptText: "//# sourceMappingURL=mod.js.map\n",
        },
      ],
      { fetch: fetchImpl },
    );

    expect(result.origins).toHaveLength(1);
    expect(result.origins[0]?.relativePath).toBe("src/mod.ts");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toContain("mod.js.map");
  });

  it("dedupes the same module path across scripts", async () => {
    const mapBody = makeMapJson(["webpack://./src/shared.ts"]);
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.endsWith(".map")) return textResponse(mapBody);
      return textResponse("", 404);
    });

    const result = await resolveJsOrigins(
      [
        { scriptSrc: "https://app.test/a.js", mapUrl: "https://app.test/a.js.map" },
        { scriptSrc: "https://app.test/b.js", mapUrl: "https://app.test/b.js.map" },
      ],
      { fetch: fetchImpl },
    );

    expect(result.origins).toHaveLength(1);
    expect(result.origins[0]?.relativePath).toBe("src/shared.ts");
  });
});

describe("resolveJsOrigins — missing map", () => {
  it("returns empty origins and does not throw when the map is missing", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => textResponse("", 404));

    const result = await resolveJsOrigins(
      [
        {
          scriptSrc: "https://app.test/a.js",
          scriptText: "//# sourceMappingURL=a.js.map\n",
        },
      ],
      { fetch: fetchImpl },
    );

    expect(result.origins).toEqual([]);
    expect(result.originsTruncated).toBe(false);
  });

  it("returns empty origins when no sourceMappingURL is present", async () => {
    const result = await resolveJsOrigins(
      [
        {
          scriptSrc: "https://app.test/plain.js",
          scriptText: "console.log(1);",
        },
      ],
      { fetch: vi.fn(async () => textResponse("", 404)) },
    );

    expect(result.origins).toEqual([]);
  });
});

describe("resolveJsOrigins — C4 caps", () => {
  it("sets originsTruncated when maxMaps is exceeded", async () => {
    const mapBody = makeMapJson(["webpack://./src/a.ts"]);
    let mapFetches = 0;
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.endsWith(".map")) {
        mapFetches += 1;
        return textResponse(mapBody);
      }
      return textResponse("", 404);
    });

    const scripts: ScriptInput[] = Array.from({ length: 5 }, (_, i) => ({
      scriptSrc: `https://app.test/chunk-${i}.js`,
      mapUrl: `https://app.test/chunk-${i}.js.map`,
    }));

    const result = await resolveJsOrigins(scripts, {
      fetch: fetchImpl,
      caps: { maxMaps: 2 },
    });

    expect(result.originsTruncated).toBe(true);
    expect(mapFetches).toBeLessThanOrEqual(2);
  });

  it("sets originsTruncated when a map exceeds maxBytesPerMap", async () => {
    const huge = "x".repeat(200);
    const mapBody = JSON.stringify({
      version: 3,
      sources: ["src/a.ts"],
      sourcesContent: ["export {}"],
      mappings: "AAAA",
      names: [],
      padding: huge,
    });

    const fetchImpl: FetchLike = vi.fn(async () => textResponse(mapBody));

    const result = await resolveJsOrigins(
      [
        {
          scriptSrc: "https://app.test/a.js",
          mapUrl: "https://app.test/a.js.map",
        },
      ],
      {
        fetch: fetchImpl,
        caps: { maxBytesPerMap: 50, maxBytesTotal: 10_000 },
      },
    );

    expect(result.origins).toEqual([]);
    expect(result.originsTruncated).toBe(true);
  });

  it("sets originsTruncated when wall clock is already exhausted", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error("fetch should not run after wall clock");
    });

    const result = await resolveJsOrigins(
      [
        {
          scriptSrc: "https://app.test/a.js",
          mapUrl: "https://app.test/a.js.map",
        },
      ],
      {
        fetch: fetchImpl,
        now: () => 0,
        caps: { wallClockMs: 0 },
      },
    );

    expect(result.originsTruncated).toBe(true);
    expect(result.origins).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("resolveJsOrigins — no debugger", () => {
  it("uses only injected fetch (no chrome.debugger surface)", async () => {
    // Contract: package API is fetch-only. This test documents the surface.
    const fetchImpl: FetchLike = vi.fn(async () => textResponse("", 404));
    await resolveJsOrigins(
      [{ scriptSrc: "https://app.test/a.js", mapUrl: "https://app.test/a.js.map" }],
      { fetch: fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalled();
    expect(typeof (globalThis as { chrome?: unknown }).chrome).toBe("undefined");
  });
});
