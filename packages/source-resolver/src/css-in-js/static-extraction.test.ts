/**
 * Static extraction tests (VC-V1V2-20) — TDD-first.
 *
 * The load-bearing contract: a fully-literal definition is deterministic
 * (isStatic === true, declarations extracted); any dynamic marker downgrades to
 * agent-required (isStatic === false + a precise dynamicReason).
 */

import { describe, expect, it } from "vitest";

import { type CssInJsDefinition, extractStaticStyles } from "./static-extraction.js";

const obj = (body: string, flavor: CssInJsDefinition["flavor"] = "emotion"): CssInJsDefinition => ({
  flavor,
  shape: "object-literal",
  body,
  workspaceRelativePath: "src/Button.tsx",
  startLine: 4,
  startColumn: 12,
  endLine: 4,
  endColumn: 40,
  componentName: "Button",
});

const tpl = (
  body: string,
  flavor: CssInJsDefinition["flavor"] = "styled-components",
): CssInJsDefinition => ({
  flavor,
  shape: "template-literal",
  body,
  workspaceRelativePath: "src/Card.tsx",
  startLine: 2,
  startColumn: 20,
  endLine: 5,
  endColumn: 1,
  componentName: "Card",
});

describe("extractStaticStyles — object-literal (deterministic)", () => {
  it("extracts string and number literals as static", () => {
    const result = extractStaticStyles(obj('color: "red", padding: 12'));
    expect(result.isStatic).toBe(true);
    expect(result.shape).toBe("object-literal");
    expect(result.declarations).toEqual([
      { property: "color", value: "red" },
      { property: "padding", value: "12" },
    ]);
    expect(result.dynamicReason).toBeUndefined();
  });

  it("extracts quoted CSS values with units", () => {
    const result = extractStaticStyles(obj('margin: "8px", border: "1px solid #fff"'));
    expect(result.isStatic).toBe(true);
    expect(result.declarations).toEqual([
      { property: "margin", value: "8px" },
      { property: "border", value: "1px solid #fff" },
    ]);
  });

  it("handles single-quoted CSS keyword values", () => {
    const result = extractStaticStyles(obj("display: 'flex', position: 'relative'"));
    expect(result.isStatic).toBe(true);
    expect(result.declarations).toEqual([
      { property: "display", value: "flex" },
      { property: "position", value: "relative" },
    ]);
  });

  it("treats a bare unquoted word as a dynamic variable reference", () => {
    // In JS object-literal syntax `position: relative` is an identifier
    // reference, not a CSS keyword — it must be flagged dynamic (agent-required).
    const result = extractStaticStyles(obj("color: 'red', position: relative"));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("function-value");
  });

  it("respects nested braces and quotes when splitting members", () => {
    const body = 'boxShadow: "0 1px 2px rgba(0,0,0,0.5)", color: "red"';
    const result = extractStaticStyles(obj(body));
    expect(result.isStatic).toBe(true);
    expect(result.declarations).toHaveLength(2);
    expect(result.declarations[1]?.value).toBe("red");
  });

  it("supports the stitches flavor without changing classification", () => {
    const result = extractStaticStyles(obj('color: "blue"', "stitches"));
    expect(result.isStatic).toBe(true);
    expect(result.flavor).toBe("stitches");
  });
});

describe("extractStaticStyles — object-literal (dynamic / agent-required)", () => {
  it("flags member access (theme.spacing) as props-reference", () => {
    const result = extractStaticStyles(obj('color: "red", margin: theme.spacing'));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("props-reference");
  });

  it("flags template interpolation in a value", () => {
    const result = extractStaticStyles(obj("color: `${theme.color}`"));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("template-interpolation");
  });

  it("flags a spread element", () => {
    const result = extractStaticStyles(obj('color: "red", ...rest'));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("spread-element");
  });

  it("flags a computed property key", () => {
    const result = extractStaticStyles(obj('[dynamicKey]: "red"'));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("computed-property");
  });

  it("flags a bare identifier value as function-value", () => {
    const result = extractStaticStyles(obj("color: someColor"));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("function-value");
  });

  it("flags a function-call value", () => {
    const result = extractStaticStyles(obj("color: getColor()"));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("props-reference");
  });
});

describe("extractStaticStyles — template-literal (styled-components)", () => {
  it("extracts static CSS declarations from a template body", () => {
    const result = extractStaticStyles(tpl("color: red;\n  padding: 8px;"));
    expect(result.isStatic).toBe(true);
    expect(result.declarations).toEqual([
      { property: "color", value: "red" },
      { property: "padding", value: "8px" },
    ]);
  });

  it("flags template interpolation as dynamic (agent-required)", () => {
    const result = extractStaticStyles(tpl("color: red;\n  background: ${bg};"));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("template-interpolation");
    expect(result.declarations).toEqual([]);
  });

  it("an empty/whitespace template body is unknown-shape (not falsely static)", () => {
    const result = extractStaticStyles(tpl("   "));
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("unknown-shape");
  });
});

describe("extractStaticStyles — unknown shape", () => {
  it("classifies an unknown shape as dynamic with no declarations", () => {
    const result = extractStaticStyles({
      flavor: "unknown",
      shape: "unknown",
      body: "function(props) { return {}; }",
      workspaceRelativePath: "x.ts",
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 1,
    });
    expect(result.isStatic).toBe(false);
    expect(result.dynamicReason).toBe("unknown-shape");
    expect(result.declarations).toEqual([]);
  });
});
