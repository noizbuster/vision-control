import { type ParserOptions, parse } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

/**
 * JSX/TSX AST helpers (PRD 14.3 steps 2-4).
 *
 * Parses a module with the Babel `jsx` + `typescript` plugins, then walks the
 * AST to locate every JSX opening element and capture the data the source-id
 * generator and registry need: the insertion offset (right after the element
 * name), the source range, the inferred component name, and any STATIC class
 * or text (dynamic expressions are skipped — they are not stable signals).
 *
 * Discrimination is done on `node.type` literals, which narrows the Babel
 * union types without importing `@babel/types` as a value.
 */

const PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
  plugins: ["jsx", "typescript"],
};

/** Parse a `.jsx`/`.tsx` module into a Babel `File` AST. Throws on syntax error. */
export const parseJsx = (code: string): t.File => parse(code, PARSER_OPTIONS);

export interface JsxElementLocation {
  /** Char offset of the element's `<`. */
  readonly start: number;
  /** Char offset after the element's closing `>` or `/>`. */
  readonly end: number;
  /** Char offset right after the element NAME — the attribute insertion point. */
  readonly nameEnd: number;
  readonly componentName: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly staticClassName: string | undefined;
  readonly staticText: string | undefined;
  readonly alreadyMarked: boolean;
  readonly source: string;
}

/** Infer a display name: `Card`, `div`, `Foo.Bar`, `ns:tag`. */
export const getElementName = (name: t.JSXOpeningElement["name"]): string => {
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") {
    return `${getElementName(name.object)}.${name.property.name}`;
  }
  return `${name.namespace.name}:${name.name.name}`;
};

/**
 * Extract a STATIC className string, or `undefined` when it is dynamic
 * (expression), a spread, or absent. Only literal class strings are stable
 * enough to feed the source resolver (PRD 14.3 / task 23).
 */
const getStaticClassName = (opening: t.JSXOpeningElement): string | undefined => {
  for (const attribute of opening.attributes) {
    if (attribute.type !== "JSXAttribute") continue;
    if (attribute.name.type !== "JSXIdentifier") continue;
    if (attribute.name.name !== "className" && attribute.name.name !== "class") continue;
    const value = attribute.value;
    if (value !== null && value !== undefined && value.type === "StringLiteral") {
      return value.value;
    }
    return undefined;
  }
  return undefined;
};

/**
 * Extract STATIC text children, or `undefined` when children are dynamic,
 * multiple, or empty. A single JSXText child is the only stable text signal.
 */
const getStaticText = (node: t.JSXElement): string | undefined => {
  if (node.children.length !== 1) return undefined;
  const child = node.children[0];
  if (child === null || child === undefined) return undefined;
  if (child.type !== "JSXText") return undefined;
  const value = child.value.trim();
  return value.length > 0 ? value : undefined;
};

const isAlreadyMarked = (opening: t.JSXOpeningElement): boolean => {
  for (const attribute of opening.attributes) {
    if (attribute.type !== "JSXAttribute") continue;
    if (attribute.name.type === "JSXIdentifier" && attribute.name.name === "data-vc-source") {
      return true;
    }
  }
  return false;
};

const asNumber = (value: number | null | undefined): number | undefined =>
  value === null || value === undefined ? undefined : value;

/**
 * Collect every JSX element location in `code`. Traverses the AST visiting
 * `JSXElement` nodes (covers `<Comp>`, `<div>`, self-closing, and nested
 * elements). Fragments (`<>...</>`) are skipped — they have no name and are not
 * addressable. Returns insertion-ready descriptors.
 */
export const findJsxElements = (ast: t.File, code: string): JsxElementLocation[] => {
  const locations: JsxElementLocation[] = [];

  traverse(ast, {
    JSXElement(jsxPath: NodePath<t.JSXElement>) {
      const node = jsxPath.node;
      const opening = node.openingElement;

      const nameEnd = asNumber(opening.name.end);
      const start = asNumber(node.start);
      const end = asNumber(node.end);
      const startLine = asNumber(node.loc?.start.line);
      const startColumn = asNumber(node.loc?.start.column);
      const endLine = asNumber(node.loc?.end.line);
      const endColumn = asNumber(node.loc?.end.column);
      if (
        nameEnd === undefined ||
        start === undefined ||
        end === undefined ||
        startLine === undefined ||
        startColumn === undefined ||
        endLine === undefined ||
        endColumn === undefined
      ) {
        return;
      }

      locations.push({
        start,
        end,
        nameEnd,
        componentName: getElementName(opening.name),
        startLine,
        startColumn,
        endLine,
        endColumn,
        staticClassName: getStaticClassName(opening),
        staticText: getStaticText(node),
        alreadyMarked: isAlreadyMarked(opening),
        source: code.slice(start, end),
      });
    },
  });

  return locations;
};
