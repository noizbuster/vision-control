import { describe, expect, it } from "vitest";

import { parseSourceMap } from "./source-map.js";
import { extractSourceMappingUrl, resolveMapUrl } from "./source-mapping-url.js";

const makeSourceMap = (opts: {
  readonly sources: readonly string[];
  readonly sourcesContent?: readonly (string | undefined)[];
  readonly mappings?: string;
}): unknown => ({
  version: 3,
  sources: opts.sources,
  sourcesContent: opts.sourcesContent,
  mappings: opts.mappings ?? "AAAA",
  names: [],
});

describe("parseSourceMap", () => {
  it("parses a minimal v3 map and finds a class selector range", () => {
    const content = ".button {\n  color: red;\n}";
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["src/Button.module.css"],
        sourcesContent: [content],
      }),
    );
    expect(sm).toBeDefined();
    const range = sm?.findSelectorRange(".button");
    expect(range).toBeDefined();
    expect(range?.sourceFile).toBe("src/Button.module.css");
    expect(range?.startLine).toBe(0);
    expect(range?.startColumn).toBe(0);
    expect(range?.endColumn).toBe(7);
  });

  it("returns undefined for non-v3 or malformed input", () => {
    expect(parseSourceMap({ version: 2, mappings: "" })).toBeUndefined();
    expect(parseSourceMap(null)).toBeUndefined();
    expect(parseSourceMap("string")).toBeUndefined();
  });

  it("returns undefined range when sourcesContent is absent", () => {
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["a.css"],
      }),
    );
    expect(sm?.findSelectorRange(".x")).toBeUndefined();
  });

  it("strips :hover when looking up a selector", () => {
    const content = ".card {\n  padding: 8px;\n}";
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["Card.css"],
        sourcesContent: [content],
      }),
    );
    const range = sm?.findSelectorRange(".card:hover");
    expect(range?.sourceFile).toBe("Card.css");
    expect(range?.startLine).toBe(0);
  });
});

describe("extractSourceMappingUrl", () => {
  it("reads the last sourceMappingURL from CSS text", () => {
    const css = ".x{}\n/*# sourceMappingURL=old.css.map */\n/*# sourceMappingURL=app.css.map */\n";
    expect(extractSourceMappingUrl(css)).toBe("app.css.map");
  });

  it("returns undefined when no directive is present", () => {
    expect(extractSourceMappingUrl(".x { color: red; }")).toBeUndefined();
  });
});

describe("resolveMapUrl", () => {
  it("resolves a relative map against the stylesheet URL", () => {
    expect(resolveMapUrl("app.css.map", "https://example.test/assets/app.css")).toBe(
      "https://example.test/assets/app.css.map",
    );
  });

  it("passes data: URLs through unchanged", () => {
    const data = "data:application/json;base64,e30=";
    expect(resolveMapUrl(data, "https://example.test/a.css")).toBe(data);
  });
});
