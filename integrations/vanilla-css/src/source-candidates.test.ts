/**
 * Source-candidate production tests for vanilla CSS (PRD §15.3 / Task 45).
 *
 * The load-bearing case (Task 45 stopping condition): a `.btn { color:red }`
 * class on an element resolves to a HIGH candidate with a concrete stylesheet
 * source range. Plus the PRD §15.3 metadata coverage: cascade layer,
 * specificity, media query, custom-property origin, and the processed-CSS
 * source-map HIGH path.
 */
import { describe, expect, it } from "vitest";

import { produceCandidates } from "./source-candidates.js";
import { parseSourceMap } from "./source-map.js";
import { parseStyleSheet } from "./stylesheet.js";

const mustSourceMap = (input: unknown) => {
  const sm = parseSourceMap(input);
  if (sm === undefined) throw new Error("test fixture produced an invalid source map");
  return sm;
};

describe("produceCandidates — .btn { color:red } → HIGH with source range", () => {
  it("produces a HIGH candidate with ast-origin evidence and a concrete range", () => {
    const sheet = parseStyleSheet(".btn { color: red; }", "src/styles.css");
    const candidates = produceCandidates(["btn"], { stylesheets: [sheet] });

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c?.confidence).toBe("high");
    expect(c?.evidence).toEqual(["ast-origin"]);
    expect(c?.workspaceRelativePath).toBe("src/styles.css");
    expect(c?.cssFilePath).toBe("src/styles.css");
    expect(c?.cssLine).toBe(1);
    expect(c?.startLine).toBe(0);
    expect(c?.startColumn).toBe(0);
    expect(c?.endColumn).toBe(4);
    expect(c?.staticClassName).toBe("btn");
    expect(c?.matchedSelector).toBe(".btn");
    expect(c?.specificity).toBe("(0,1,0)");
  });
});

describe("produceCandidates — PRD §15.3 metadata", () => {
  it("records cascade layer and media query on a layered media rule", () => {
    const css =
      "@layer components {\n  @media (min-width: 600px) {\n    .btn { font-size: 14px; }\n  }\n}";
    const sheet = parseStyleSheet(css, "x.css");
    const candidates = produceCandidates(["btn"], { stylesheets: [sheet] });

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c?.cascadeLayer).toBe("components");
    expect(c?.mediaQuery).toBe("(min-width: 600px)");
    expect(c?.specificity).toBe("(0,1,0)");
    expect(c?.warnings.some((w) => w.includes("cascade layer: components"))).toBe(true);
    expect(c?.warnings.some((w) => w.includes("media query: (min-width: 600px)"))).toBe(true);
  });

  it("traces a custom-property origin when a matched rule references var(--primary)", () => {
    const css = ":root { --primary: #f00; }\n.btn { color: var(--primary); }";
    const sheet = parseStyleSheet(css, "src/theme.css");
    const candidates = produceCandidates(["btn"], { stylesheets: [sheet] });

    expect(candidates).toHaveLength(1);
    const origin = candidates[0]?.customPropertyOrigin;
    expect(origin?.name).toBe("--primary");
    expect(origin?.value).toBe("#f00");
    expect(origin?.stylesheetUrl).toBe("src/theme.css");
  });
});

describe("produceCandidates — processed CSS source map (HIGH)", () => {
  it("produces a HIGH candidate with source-map evidence when a source map resolves a range", () => {
    const generatedSheet = parseStyleSheet(".btn{color:red}", "dist/build.css");
    const sourceMaps = new Map([
      [
        "dist/build.css",
        mustSourceMap({
          version: 3,
          sources: ["src/styles.css"],
          sourcesContent: [".btn {\n  color: red;\n}"],
          mappings: "AAAA",
          names: [],
        }),
      ],
    ]);
    const candidates = produceCandidates(["btn"], {
      stylesheets: [generatedSheet],
      sourceMaps,
    });

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c?.confidence).toBe("high");
    expect(c?.evidence).toEqual(["source-map"]);
    expect(c?.workspaceRelativePath).toBe("src/styles.css");
    expect(c?.startLine).toBe(0);
    expect(c?.startColumn).toBe(0);
  });

  it("downgrades to MEDIUM when a source map exists but the selector range is unresolved", () => {
    const generatedSheet = parseStyleSheet(".btn{color:red}", "dist/build.css");
    const sourceMaps = new Map([
      [
        "dist/build.css",
        mustSourceMap({
          version: 3,
          sources: ["src/styles.css"],
          // No sourcesContent → range cannot be resolved.
          mappings: "AAAA",
          names: [],
        }),
      ],
    ]);
    const candidates = produceCandidates(["btn"], {
      stylesheets: [generatedSheet],
      sourceMaps,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).not.toBe("high");
    expect(candidates[0]?.warnings.some((w) => w.includes("not resolved"))).toBe(true);
  });
});

describe("produceCandidates — empty / no-match cases", () => {
  it("returns an empty array when no classes are provided", () => {
    const sheet = parseStyleSheet(".btn { color: red; }", "x.css");
    expect(produceCandidates([], { stylesheets: [sheet] })).toEqual([]);
  });

  it("returns an empty array when no stylesheets are loaded", () => {
    expect(produceCandidates(["btn"], {})).toEqual([]);
  });

  it("returns an empty array when no rule matches the class", () => {
    const sheet = parseStyleSheet(".other { color: red; }", "x.css");
    expect(produceCandidates(["btn"], { stylesheets: [sheet] })).toEqual([]);
  });

  it("produces multiple candidates when a class matches several rules", () => {
    const css = ".btn { color: red; }\n@layer c { .btn { padding: 0; } }";
    const sheet = parseStyleSheet(css, "x.css");
    const candidates = produceCandidates(["btn"], { stylesheets: [sheet] });
    expect(candidates).toHaveLength(2);
    expect(candidates.some((c) => c.cascadeLayer === "c")).toBe(true);
  });
});
