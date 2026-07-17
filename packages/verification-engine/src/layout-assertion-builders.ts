import type { Operation } from "@vision-control/change-ir";

import { assertComputedStyle } from "./assertions/computed-style.js";
import { assertSiblingOrder } from "./assertions/sibling-order.js";
import { contextDependentNote } from "./context-dependent-assertion.js";
import type { AssertionEntry } from "./types.js";

export function buildGridReorderAssertions(
  operation: Extract<Operation, { kind: "grid-reorder" }>,
): AssertionEntry[] {
  if (operation.placement === "dom-order") {
    return [
      {
        name: "grid-reorder:dom-order",
        run: (target) => assertSiblingOrder(target, operation.toIndex),
      },
    ];
  }
  const area = operation.newGridArea;
  if (area === undefined) return [];
  const parts = area.split("/").map((part) => part.trim());
  const rowStart = parts[0];
  const colStart = parts[1];
  const expected: { property: string; value: string }[] = [];
  if (rowStart !== undefined && rowStart.length > 0) {
    expected.push({ property: "grid-row-start", value: rowStart });
  }
  if (colStart !== undefined && colStart.length > 0) {
    expected.push({ property: "grid-column-start", value: colStart });
  }
  if (expected.length === 0) return [];
  return [
    {
      name: "grid-reorder:grid-area",
      run: (target) => assertComputedStyle(target, expected),
    },
  ];
}

export function buildGridSpanAssertions(
  operation: Extract<Operation, { kind: "grid-span" }>,
): AssertionEntry[] {
  const property = operation.axis === "column" ? "grid-column-end" : "grid-row-end";
  return [
    {
      name: `grid-span:${operation.axis}`,
      run: (target) =>
        assertComputedStyle(target, [{ property, value: `span ${operation.toSpan}` }]),
    },
  ];
}

export function buildChildSizingAssertions(
  operation: Extract<Operation, { kind: "set-child-sizing" }>,
): AssertionEntry[] {
  if (operation.value !== undefined && operation.value.length > 0) {
    return [
      {
        name: "set-child-sizing:value",
        run: (target) =>
          assertComputedStyle(target, [{ property: "width", value: operation.value ?? "" }]),
      },
    ];
  }
  return [
    {
      name: "set-child-sizing:context-dependent",
      run: () =>
        contextDependentNote(
          `set-child-sizing (${operation.sizing})`,
          "Auto Layout sizing is context-dependent; verify the rendered hug/fill/fixed result visually.",
        ),
    },
  ];
}

export function buildGroupReorderAssertions(
  operation: Extract<Operation, { kind: "group-reorder" }>,
): AssertionEntry[] {
  const firstNewPosition = operation.newOrder[0] ?? 0;
  return [
    {
      name: "group-reorder:first-child-position",
      run: (target) => assertSiblingOrder(target, firstNewPosition),
    },
  ];
}
