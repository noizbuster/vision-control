import { describe, expect, it } from "vitest";

import { parseStyleSheet } from "./stylesheet.js";

describe("parseStyleSheet — plain rules", () => {
  it("parses a single class rule with selector range and declarations", () => {
    const sheet = parseStyleSheet(".btn { color: red; }", "src/styles.css");
    expect(sheet.rules).toHaveLength(1);
    const rule = sheet.rules[0];
    // The selector list is the trimmed prelude up to '{'.
    expect(rule?.selectorList).toBe(".btn");
    expect(rule?.declarations.get("color")).toBe("red");
    expect(rule?.range.startLine).toBe(0);
    expect(rule?.range.startColumn).toBe(0);
    expect(rule?.range.endColumn).toBe(4);
  });

  it("computes 0-based line/column across multiple rules", () => {
    const css = ".a { color: red; }\n.b { color: blue; }";
    const sheet = parseStyleSheet(css, "x.css");
    expect(sheet.rules).toHaveLength(2);
    const second = sheet.rules[1];
    expect(second?.selectorList).toBe(".b");
    expect(second?.range.startLine).toBe(1);
    expect(second?.range.startColumn).toBe(0);
  });

  it("preserves a comma-separated selector list", () => {
    const sheet = parseStyleSheet("a, .btn, #x { color: red; }", "x.css");
    expect(sheet.rules[0]?.selectorList).toBe("a, .btn, #x");
  });
});

describe("parseStyleSheet — @layer and @media", () => {
  it("records the cascade layer on nested rules", () => {
    const sheet = parseStyleSheet("@layer components {\n  .card { padding: 1rem; }\n}", "x.css");
    expect(sheet.rules).toHaveLength(1);
    expect(sheet.rules[0]?.cascadeLayer).toBe("components");
    expect(sheet.rules[0]?.selectorList).toBe(".card");
  });

  it("records the media query on nested rules", () => {
    const sheet = parseStyleSheet(
      "@media (min-width: 600px) {\n  .btn { font-size: 14px; }\n}",
      "x.css",
    );
    expect(sheet.rules).toHaveLength(1);
    expect(sheet.rules[0]?.mediaQuery).toBe("(min-width: 600px)");
    expect(sheet.rules[0]?.selectorList).toBe(".btn");
  });

  it("skips @keyframes blocks without misreading keyframe offsets as selectors", () => {
    const sheet = parseStyleSheet(
      "@keyframes spin {\n  from { transform: rotate(0); }\n  to { transform: rotate(360deg); }\n}\n.btn { color: red; }",
      "x.css",
    );
    expect(sheet.rules).toHaveLength(1);
    expect(sheet.rules[0]?.selectorList).toBe(".btn");
  });

  it("skips @import at-statements", () => {
    const sheet = parseStyleSheet("@import url('./other.css');\n.btn { color: red; }", "x.css");
    expect(sheet.rules).toHaveLength(1);
    expect(sheet.rules[0]?.selectorList).toBe(".btn");
  });
});

describe("parseStyleSheet — custom properties", () => {
  it("collects --var declarations from :root", () => {
    const sheet = parseStyleSheet(":root { --primary: #f00; --gap: 1rem; }", "x.css");
    expect(sheet.customProperties.map((c) => c.name)).toEqual(["--primary", "--gap"]);
    expect(sheet.customProperties[0]?.value).toBe("#f00");
  });

  it("collects --var declarations inside a cascade layer", () => {
    const sheet = parseStyleSheet("@layer theme { :root { --primary: #f00; } }", "x.css");
    expect(sheet.customProperties).toHaveLength(1);
    expect(sheet.customProperties[0]?.cascadeLayer).toBe("theme");
  });
});

describe("parseStyleSheet — robustness", () => {
  it("strips comments while preserving line/column indices", () => {
    const sheet = parseStyleSheet("/* header */\n.btn /* x */ { color: red; }", "x.css");
    expect(sheet.rules).toHaveLength(1);
    expect(sheet.rules[0]?.selectorList).toBe(".btn");
    expect(sheet.rules[0]?.range.startLine).toBe(1);
  });

  it("does not throw on unbalanced input", () => {
    expect(() => parseStyleSheet(".btn { color: red;", "x.css")).not.toThrow();
    expect(() => parseStyleSheet("}}}", "x.css")).not.toThrow();
    expect(() => parseStyleSheet("", "x.css")).not.toThrow();
  });
});
