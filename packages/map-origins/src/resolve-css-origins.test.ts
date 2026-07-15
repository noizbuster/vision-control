import { describe, expect, it, vi } from "vitest";

import { resolveCssOrigins } from "./resolve-css-origins.js";
import type { CssRuleInput, FetchLike } from "./types.js";

const SOURCE_CONTENT = ".button {\n  color: red;\n}\n";

const makeMapJson = (sourceFile: string, content: string): string =>
  JSON.stringify({
    version: 3,
    sources: [sourceFile],
    sourcesContent: [content],
    mappings: "AAAA",
    names: [],
  });

const textResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });

describe("resolveCssOrigins — happy path", () => {
  it("resolves CSS rule → stylesheet → map → origin with range", async () => {
    const mapBody = makeMapJson("src/Button.module.css", SOURCE_CONTENT);
    const cssBody = `.button{color:red}\n/*# sourceMappingURL=Button.module.css.map */\n`;

    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.endsWith("Button.module.css") && !url.endsWith(".map")) {
        return textResponse(cssBody);
      }
      if (url.endsWith("Button.module.css.map")) {
        return textResponse(mapBody);
      }
      return textResponse("", 404);
    });

    const rules: CssRuleInput[] = [
      {
        selectorText: ".button",
        stylesheetHref: "https://app.test/assets/Button.module.css",
      },
    ];

    const result = await resolveCssOrigins(rules, { fetch: fetchImpl });

    expect(result.originsTruncated).toBe(false);
    expect(result.origins).toHaveLength(1);
    const origin = result.origins[0];
    expect(origin?.kind).toBe("css");
    expect(origin?.sourceUrl).toBe("https://app.test/assets/Button.module.css");
    expect(origin?.mapUrl).toBe("https://app.test/assets/Button.module.css.map");
    expect(origin?.relativePath).toBe("src/Button.module.css");
    expect(origin?.startLine).toBe(1);
    expect(origin?.startColumn).toBe(0);
    expect(origin?.confidence).toBe("high");
    expect(origin?.warnings).toEqual([]);
  });

  it("uses provided stylesheetText without fetching the stylesheet", async () => {
    const mapBody = makeMapJson("Card.css", ".card {\n  padding: 1px;\n}");
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.endsWith("Card.css.map")) return textResponse(mapBody);
      return textResponse("", 404);
    });

    const result = await resolveCssOrigins(
      [
        {
          selectorText: ".card",
          stylesheetHref: "https://app.test/Card.css",
          stylesheetText: ".card{}\n/*# sourceMappingURL=Card.css.map */",
        },
      ],
      { fetch: fetchImpl },
    );

    expect(result.origins).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toContain("Card.css.map");
  });
});

describe("resolveCssOrigins — missing map", () => {
  it("returns empty origins and does not throw when the map is missing", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => textResponse("", 404));

    const result = await resolveCssOrigins(
      [
        {
          selectorText: ".missing",
          stylesheetHref: "https://app.test/a.css",
          stylesheetText: ".missing{}\n/*# sourceMappingURL=a.css.map */",
        },
      ],
      { fetch: fetchImpl },
    );

    expect(result.origins).toEqual([]);
    expect(result.originsTruncated).toBe(false);
  });

  it("returns empty origins when no sourceMappingURL is present", async () => {
    const result = await resolveCssOrigins(
      [
        {
          selectorText: ".x",
          stylesheetHref: "https://app.test/plain.css",
          stylesheetText: ".x { color: blue; }",
        },
      ],
      { fetch: vi.fn(async () => textResponse("", 404)) },
    );

    expect(result.origins).toEqual([]);
  });
});

describe("resolveCssOrigins — C4 caps", () => {
  it("sets originsTruncated when maxMaps is exceeded", async () => {
    const mapBody = makeMapJson("a.css", ".a {\n  color: red;\n}");
    let mapFetches = 0;
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      if (url.endsWith(".map")) {
        mapFetches += 1;
        return textResponse(mapBody);
      }
      return textResponse("", 404);
    });

    const rules: CssRuleInput[] = Array.from({ length: 5 }, (_, i) => ({
      selectorText: ".a",
      stylesheetHref: `https://app.test/sheet-${i}.css`,
      mapUrl: `https://app.test/map-${i}.css.map`,
    }));

    const result = await resolveCssOrigins(rules, {
      fetch: fetchImpl,
      caps: { maxMaps: 2 },
    });

    expect(result.originsTruncated).toBe(true);
    expect(result.origins.length).toBeLessThanOrEqual(2);
    expect(mapFetches).toBeLessThanOrEqual(2);
  });

  it("sets originsTruncated when a map exceeds maxBytesPerMap", async () => {
    const huge = "x".repeat(200);
    const mapBody = JSON.stringify({
      version: 3,
      sources: ["big.css"],
      sourcesContent: [".a {}"],
      mappings: "AAAA",
      names: [],
      padding: huge,
    });

    const fetchImpl: FetchLike = vi.fn(async () => textResponse(mapBody));

    const result = await resolveCssOrigins(
      [
        {
          selectorText: ".a",
          stylesheetHref: "https://app.test/a.css",
          mapUrl: "https://app.test/a.css.map",
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
    let clock = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error("fetch should not run after wall clock");
    });

    const result = await resolveCssOrigins(
      [
        {
          selectorText: ".a",
          stylesheetHref: "https://app.test/a.css",
          mapUrl: "https://app.test/a.css.map",
        },
      ],
      {
        fetch: fetchImpl,
        now: () => clock,
        caps: { wallClockMs: 0 },
      },
    );

    // startedAt = 0, now() = 0, wallClockMs = 0 → immediately truncated
    expect(result.originsTruncated).toBe(true);
    expect(result.origins).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    clock = 1;
  });
});

describe("resolveCssOrigins — map without range", () => {
  it("emits a medium-confidence origin when sourcesContent lacks the selector", async () => {
    const mapBody = makeMapJson("other.css", ".other {\n  color: blue;\n}");
    const fetchImpl: FetchLike = vi.fn(async () => textResponse(mapBody));

    const result = await resolveCssOrigins(
      [
        {
          selectorText: ".button",
          stylesheetHref: "https://app.test/a.css",
          mapUrl: "https://app.test/a.css.map",
        },
      ],
      { fetch: fetchImpl },
    );

    expect(result.origins).toHaveLength(1);
    expect(result.origins[0]?.confidence).toBe("medium");
    expect(result.origins[0]?.warnings).toContain("map-present-without-range");
    expect(result.origins[0]?.startLine).toBeUndefined();
  });
});
