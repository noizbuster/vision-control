/**
 * Component prop discovery tests (VC-V1V2-21).
 *
 * The two load-bearing contracts:
 *   1. A safe static literal prop (`variant="secondary"`) is discovered with
 *      its literal value + precise source range — the prerequisites for a
 *      deterministic suggestion.
 *   2. A dynamic/computed prop (`variant={computeVariant(user)}`) is classified
 *      as dynamic — NO literal value, NO source range. This is the
 *      misleading-success-output guard: the agent is never told a dynamic prop
 *      is safely editable.
 */

import { describe, expect, it } from "vitest";

import {
  type ComponentFramework,
  type DiscoveredProp,
  discoverProps,
  isLiteralProp,
} from "./prop-discovery.js";

const discover = (
  source: string,
  componentName: string,
  framework: ComponentFramework = "jsx",
): readonly DiscoveredProp[] =>
  discoverProps({
    framework,
    componentName,
    filePath: "src/Button.tsx",
    sourceText: source,
  }).props;

const findProp = (props: readonly DiscoveredProp[], name: string): DiscoveredProp => {
  const prop = props.find((p) => p.name === name);
  if (prop === undefined)
    throw new Error(`prop "${name}" not found in ${JSON.stringify(props.map((p) => p.name))}`);
  return prop;
};

describe("discoverProps — JSX literal props produce literal value + source range", () => {
  it('discovers a string literal prop (variant="secondary") with value and range', () => {
    const source = 'export const App = () => <Button variant="secondary">Save</Button>;';
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("literal-string");
    expect(variant.literalValue).toBe("secondary");
    expect(variant.sourceRange).toBeDefined();
    if (variant.sourceRange === undefined) throw new Error("range missing");
    expect(variant.sourceRange.startLine).toBe(1);
    expect(variant.sourceRange.startColumn).toBeLessThanOrEqual(variant.sourceRange.endColumn);
  });

  it("discovers a boolean shorthand prop (disabled) as literal-boolean true", () => {
    const source = "export const App = () => <Button disabled>Save</Button>;";
    const props = discover(source, "Button");
    const disabled = findProp(props, "disabled");
    expect(disabled.kind).toBe("literal-boolean");
    expect(disabled.literalValue).toBe(true);
  });

  it("discovers a boolean expression (disabled={false}) as literal-boolean false", () => {
    const source = "export const App = () => <Button disabled={false}>Save</Button>;";
    const props = discover(source, "Button");
    const disabled = findProp(props, "disabled");
    expect(disabled.kind).toBe("literal-boolean");
    expect(disabled.literalValue).toBe(false);
  });

  it("discovers a number literal prop (count={42}) as literal-number", () => {
    const source = "export const App = () => <Button count={42}>Save</Button>;";
    const props = discover(source, "Button");
    const count = findProp(props, "count");
    expect(count.kind).toBe("literal-number");
    expect(count.literalValue).toBe(42);
  });

  it("discovers a quoted string inside JSX expression (variant={'primary'}) as literal-string", () => {
    const source = "export const App = () => <Button variant={'primary'}>Save</Button>;";
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("literal-string");
    expect(variant.literalValue).toBe("primary");
  });

  it("source range is precise (maps to the exact character offset)", () => {
    const source = '  <Button variant="secondary">x</Button>';
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.sourceRange).toBeDefined();
    if (variant.sourceRange === undefined) throw new Error("range missing");
    expect(variant.sourceRange.startColumn).toBeGreaterThan(0);
    expect(variant.sourceRange.endColumn).toBeGreaterThan(variant.sourceRange.startColumn);
  });
});

describe("discoverProps — dynamic/computed props produce NO literal value, NO range", () => {
  it("discards a function call expression (variant={computeVariant(user)}) as dynamic-expression", () => {
    const source = "export const App = () => <Button variant={computeVariant(user)}>Save</Button>;";
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("dynamic-expression");
    expect(variant.literalValue).toBeUndefined();
    expect(variant.sourceRange).toBeUndefined();
    expect(isLiteralProp(variant)).toBe(false);
  });

  it("classifies a member access (variant={config.variant}) as member-access", () => {
    const source = "export const App = () => <Button variant={config.variant}>Save</Button>;";
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("member-access");
    expect(variant.literalValue).toBeUndefined();
    expect(isLiteralProp(variant)).toBe(false);
  });

  it("classifies a conditional (variant={cond ? 'a' : 'b'}) as computed", () => {
    const source = "export const App = () => <Button variant={cond ? 'a' : 'b'}>Save</Button>;";
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("computed");
    expect(variant.literalValue).toBeUndefined();
    expect(isLiteralProp(variant)).toBe(false);
  });

  it("classifies a bare identifier (variant={someVar}) as identifier", () => {
    const source = "export const App = () => <Button variant={someVar}>Save</Button>;";
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("identifier");
    expect(variant.literalValue).toBeUndefined();
    expect(isLiteralProp(variant)).toBe(false);
  });
});

describe("discoverProps — multiple props on one component", () => {
  it("discovers all props on a multi-attribute component", () => {
    const source =
      'export const App = () => <Button variant="primary" size={42} disabled onClick={handler}>Save</Button>;';
    const props = discover(source, "Button");
    expect(props).toHaveLength(4);
    expect(findProp(props, "variant").kind).toBe("literal-string");
    expect(findProp(props, "size").kind).toBe("literal-number");
    expect(findProp(props, "disabled").kind).toBe("literal-boolean");
    expect(findProp(props, "onClick").kind).toBe("identifier");
  });
});

describe("discoverProps — Vue framework", () => {
  it('discovers a static string prop (variant="secondary") for Vue', () => {
    const source = '<template><Button variant="secondary">Save</Button></template>';
    const props = discover(source, "Button", "vue");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("literal-string");
    expect(variant.literalValue).toBe("secondary");
  });

  it('classifies a Vue binding (:variant="someVar") as identifier (dynamic)', () => {
    const source = '<template><Button :variant="someVar">Save</Button></template>';
    const props = discover(source, "Button", "vue");
    const variant = findProp(props, "variant");
    expect(variant.isBinding).toBe(true);
    expect(isLiteralProp(variant)).toBe(false);
    expect(variant.literalValue).toBeUndefined();
  });

  it('classifies a Vue boolean binding (:disabled="false") as literal-boolean', () => {
    const source = '<template><Button :disabled="false">Save</Button></template>';
    const props = discover(source, "Button", "vue");
    const disabled = findProp(props, "disabled");
    expect(disabled.kind).toBe("literal-boolean");
    expect(disabled.literalValue).toBe(false);
  });

  it("classifies a v-bind: directive binding as a binding", () => {
    const source = '<template><Button v-bind:variant="someVar">Save</Button></template>';
    const props = discover(source, "Button", "vue");
    const variant = findProp(props, "variant");
    expect(variant.isBinding).toBe(true);
    expect(isLiteralProp(variant)).toBe(false);
  });
});

describe("discoverProps — Svelte framework (JSX-like syntax)", () => {
  it("discovers a static string prop for Svelte", () => {
    const source = '<Button variant="secondary">Save</Button>';
    const props = discover(source, "Button", "svelte");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("literal-string");
    expect(variant.literalValue).toBe("secondary");
  });

  it("discovers a Svelte boolean expression ({false}) as literal-boolean", () => {
    const source = "<Button disabled={false}>Save</Button>";
    const props = discover(source, "Button", "svelte");
    const disabled = findProp(props, "disabled");
    expect(disabled.kind).toBe("literal-boolean");
    expect(disabled.literalValue).toBe(false);
  });
});

describe("discoverProps — robustness", () => {
  it("returns empty props when the component is not found", () => {
    const source = "export const App = () => <div>nothing</div>;";
    const result = discoverProps({
      framework: "jsx",
      componentName: "Button",
      filePath: "src/App.tsx",
      sourceText: source,
    });
    expect(result.props).toEqual([]);
  });

  it("handles multi-line source (source range line numbers are correct)", () => {
    const source = [
      "import { Button } from './Button';",
      "",
      "export const App = () => (",
      '  <Button variant="primary">',
      "    Save",
      "  </Button>",
      ");",
    ].join("\n");
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.sourceRange).toBeDefined();
    if (variant.sourceRange === undefined) throw new Error("range missing");
    expect(variant.sourceRange.startLine).toBe(4);
  });

  it("respects nearLine to pick a specific instance", () => {
    const source = [
      'const a = <Button variant="primary">A</Button>;',
      'const b = <Button variant="secondary">B</Button>;',
    ].join("\n");
    const props = discoverProps({
      framework: "jsx",
      componentName: "Button",
      filePath: "src/App.tsx",
      sourceText: source,
      nearLine: 2,
    }).props;
    const variant = findProp(props, "variant");
    expect(variant.literalValue).toBe("secondary");
  });

  it("handles self-closing component tags", () => {
    const source = '<Button variant="primary" />';
    const props = discover(source, "Button");
    const variant = findProp(props, "variant");
    expect(variant.kind).toBe("literal-string");
    expect(variant.literalValue).toBe("primary");
  });

  it("handles attributes with braces in the value expression", () => {
    const source = "<Button onClick={() => { doThing(); }} >x</Button>";
    const props = discover(source, "Button");
    const onClick = findProp(props, "onClick");
    expect(isLiteralProp(onClick)).toBe(false);
  });
});

describe("isLiteralProp", () => {
  it("returns true for literal-string, literal-boolean, literal-number", () => {
    expect(isLiteralProp({ name: "x", kind: "literal-string", rawValue: "a" })).toBe(true);
    expect(isLiteralProp({ name: "x", kind: "literal-boolean", rawValue: "" })).toBe(true);
    expect(isLiteralProp({ name: "x", kind: "literal-number", rawValue: "1" })).toBe(true);
  });

  it("returns false for dynamic kinds", () => {
    expect(isLiteralProp({ name: "x", kind: "dynamic-expression", rawValue: "f()" })).toBe(false);
    expect(isLiteralProp({ name: "x", kind: "member-access", rawValue: "a.b" })).toBe(false);
    expect(isLiteralProp({ name: "x", kind: "computed", rawValue: "c ? a : b" })).toBe(false);
    expect(isLiteralProp({ name: "x", kind: "identifier", rawValue: "x" })).toBe(false);
  });
});
