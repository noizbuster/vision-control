/**
 * Local findJsxElements with correct @babel/traverse CJS/ESM interop (task-10).
 *
 * Under Node 22+ ESM, `import traverse from "@babel/traverse"` yields
 * `module.exports` (an object), not `module.exports.default` (the function).
 * This module loads @babel/traverse via CJS `require()` (which correctly
 * returns `module.exports`), extracts the function, and re-implements
 * findJsxElements with identical behavior to the vite-react original.
 *
 * Only findJsxElements is re-implemented here — it is the sole consumer of
 * traverse in the entire vite-react → next-react import chain. All other
 * helpers (parseJsx, getElementName, matchAny, etc.) are imported from
 * vite-react unchanged because they do not touch traverse.
 *
 * @babel/traverse is resolved from @vision-control/vite-react's node_modules
 * because it is a declared dependency of vite-react, not of next-react.
 */

import { createRequire } from "node:module";

import type { File, JSXElement, JSXOpeningElement } from "@babel/types";
import { getElementName, type JsxElementLocation } from "@vision-control/vite-react";

const meta = import.meta as ImportMeta & { resolve(specifier: string): string };
const viteReactUrl = meta.resolve("@vision-control/vite-react");
const requireFromViteReact = createRequire(viteReactUrl);

const traverseModule = requireFromViteReact("@babel/traverse") as {
  default: (ast: File, visitors: Record<string, unknown>) => void;
};
const traverse = traverseModule.default;

const asNumber = (value: number | null | undefined): number | undefined =>
  value === null || value === undefined ? undefined : value;

const getStaticClassName = (opening: JSXOpeningElement): string | undefined => {
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

const getStaticText = (node: JSXElement): string | undefined => {
  if (node.children.length !== 1) return undefined;
  const child = node.children[0];
  if (child === null || child === undefined) return undefined;
  if (child.type !== "JSXText") return undefined;
  const value = child.value.trim();
  return value.length > 0 ? value : undefined;
};

const isAlreadyMarked = (opening: JSXOpeningElement): boolean => {
  for (const attribute of opening.attributes) {
    if (attribute.type !== "JSXAttribute") continue;
    if (attribute.name.type === "JSXIdentifier" && attribute.name.name === "data-vc-source") {
      return true;
    }
  }
  return false;
};

export const findJsxElements = (ast: File, code: string): JsxElementLocation[] => {
  const locations: JsxElementLocation[] = [];

  traverse(ast, {
    JSXElement(jsxPath: { node: JSXElement }) {
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
