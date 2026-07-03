/**
 * Tests for CSS source-map v3 parsing (VC-V1V2-12, TDD-first).
 *
 * Covers VLQ decoding, sourcesContent class lookup, missing sourcesContent
 * degradation, and malformed input.
 */
import { describe, expect, it } from "vitest";

import { parseSourceMap } from "./source-map.js";

/** Build a minimal v3 source map object with sourcesContent. */
const makeSourceMap = (opts: {
  readonly sources: readonly string[];
  readonly sourcesContent: readonly string[];
  readonly mappings?: string;
}): unknown => ({
  version: 3,
  sources: opts.sources,
  sourcesContent: opts.sourcesContent,
  mappings: opts.mappings ?? "AAAA",
  names: [],
});

describe("parseSourceMap — basic v3 parsing", () => {
  it("parses a minimal v3 source map with sources and sourcesContent", () => {
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["Button.module.css"],
        sourcesContent: [".button {\n  color: red;\n}"],
      }),
    );
    expect(sm).toBeDefined();
    expect(sm?.sources).toEqual(["Button.module.css"]);
    expect(sm?.sourcesContent).toEqual([".button {\n  color: red;\n}"]);
  });

  it("returns undefined for a non-v3 source map", () => {
    expect(parseSourceMap({ version: 2, mappings: "" })).toBeUndefined();
  });

  it("returns undefined for a missing mappings field", () => {
    expect(parseSourceMap({ version: 3, sources: [] })).toBeUndefined();
  });

  it("returns undefined for null / non-object input", () => {
    expect(parseSourceMap(null)).toBeUndefined();
    expect(parseSourceMap("string")).toBeUndefined();
    expect(parseSourceMap(42)).toBeUndefined();
  });
});

describe("parseSourceMap — VLQ decoding", () => {
  it("decodes the trivial mapping AAAA (all zeros)", () => {
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["a.css"],
        sourcesContent: [".x {}"],
        mappings: "AAAA",
      }),
    );
    expect(sm).toBeDefined();
    const seg = sm?.allSegments[0]?.[0];
    expect(seg).toBeDefined();
    expect(seg?.generatedLine).toBe(0);
    expect(seg?.generatedColumn).toBe(0);
    expect(seg?.sourceIndex).toBe(0);
    expect(seg?.sourceLine).toBe(0);
    expect(seg?.sourceColumn).toBe(0);
  });

  it("handles empty lines (semicolon-separated)", () => {
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["a.css"],
        sourcesContent: [".x {}"],
        mappings: "AAAA;;;AAAA",
      }),
    );
    expect(sm?.allSegments.length).toBe(4);
    expect(sm?.allSegments[1]).toEqual([]);
    expect(sm?.allSegments[2]).toEqual([]);
  });
});

describe("findClassDeclaration — sourcesContent lookup", () => {
  it("finds a simple class declaration and returns its source range", () => {
    const content = ".button {\n  color: red;\n}";
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["src/Button.module.css"],
        sourcesContent: [content],
      }),
    );
    const range = sm?.findClassDeclaration("button");
    expect(range).toBeDefined();
    expect(range?.sourceFile).toBe("src/Button.module.css");
    expect(range?.startLine).toBe(0);
    expect(range?.startColumn).toBe(0);
    expect(range?.endColumn).toBe(7);
  });

  it("finds a class declared on a later line", () => {
    const content = "/* comment */\n.container {\n  display: flex;\n}";
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["Layout.module.css"],
        sourcesContent: [content],
      }),
    );
    const range = sm?.findClassDeclaration("container");
    expect(range).toBeDefined();
    expect(range?.startLine).toBe(1);
    expect(range?.startColumn).toBe(0);
  });

  it("returns undefined when the class is not in sourcesContent", () => {
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["Button.module.css"],
        sourcesContent: [".other {\n  color: blue;\n}"],
      }),
    );
    expect(sm?.findClassDeclaration("button")).toBeUndefined();
  });

  it("returns undefined when sourcesContent is absent", () => {
    const sm = parseSourceMap({
      version: 3,
      sources: ["Button.module.css"],
      mappings: "AAAA",
      names: [],
    });
    expect(sm?.findClassDeclaration("button")).toBeUndefined();
  });

  it("searches multiple sources and finds the match in the second one", () => {
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["A.module.css", "B.module.css"],
        sourcesContent: [".other {}", ".target {\n  display: block;\n}"],
      }),
    );
    const range = sm?.findClassDeclaration("target");
    expect(range?.sourceFile).toBe("B.module.css");
    expect(range?.startLine).toBe(0);
  });

  it("does not match substrings (only exact class names)", () => {
    const content = ".button-large {\n  color: red;\n}";
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["Button.module.css"],
        sourcesContent: [content],
      }),
    );
    expect(sm?.findClassDeclaration("button")).toBeUndefined();
  });

  it("matches classes in a selector group (comma-separated)", () => {
    const content = ".button, .link {\n  cursor: pointer;\n}";
    const sm = parseSourceMap(
      makeSourceMap({
        sources: ["UI.module.css"],
        sourcesContent: [content],
      }),
    );
    const range = sm?.findClassDeclaration("link");
    expect(range).toBeDefined();
  });
});
