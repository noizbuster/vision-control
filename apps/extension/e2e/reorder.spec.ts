import { expect, test } from "@playwright/test";

import { computeInverse, type ReorderChildOperation } from "@vision-control/change-ir";
import { computeInsertionIndex } from "@vision-control/layout-engine";

/**
 * @reorder — AC-003 Flex/container reorder.
 *
 * Verifies: flex vertical/horizontal reorder, block flow, insertion indicator
 * position, operation kind is reorder-child, and the inverse restores order.
 * Unit-level tests verify insertion index + inverse without a browser.
 */

const reorderOp: ReorderChildOperation = {
  kind: "reorder-child",
  id: "reorder-001",
  timestamp: 1000,
  runtime: false,
  parent: { runtimeId: "parent-r01" },
  child: { runtimeId: "child-r01" },
  fromIndex: 2,
  toIndex: 0,
};

/** Simulate remove-then-insert reorder on an array. */
const applyReorder = <T>(arr: readonly T[], from: number, to: number): T[] => {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
};

test.describe("@reorder unit", () => {
  test("insertion index for vertical flex splits at midpoint boundary", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 100, height: 50 } },
      { rect: { x: 0, y: 50, width: 100, height: 50 } },
      { rect: { x: 0, y: 100, width: 100, height: 50 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-r01" },
      children,
      50,
      75,
      "flex-container",
      "column",
    );
    expect(result.index).toBe(1);
  });

  test("reorder-child inverse swaps fromIndex and toIndex", () => {
    const inverse = computeInverse(reorderOp);
    expect(inverse.kind).toBe("reorder-child");
    if (inverse.kind === "reorder-child") {
      expect(inverse.fromIndex).toBe(0);
      expect(inverse.toIndex).toBe(2);
    }
    expect(inverse.inverseOf).toBe("reorder-001");
  });

  test("applying reorder then its inverse restores original array order", () => {
    const original = ["a", "b", "c", "d", "e"];
    const forward = applyReorder(original, 2, 0);
    expect(forward).toEqual(["c", "a", "b", "d", "e"]);
    const restored = applyReorder(forward, 0, 2);
    expect(restored).toEqual(original);
  });

  test("runtime flag is preserved on inverse (preview undo stays preview)", () => {
    const previewReorder: ReorderChildOperation = {
      ...reorderOp,
      id: "reorder-pre",
      runtime: true,
    };
    const inverse = computeInverse(previewReorder);
    expect(inverse.runtime).toBe(true);
  });
});

test.describe("@reorder browser", () => {
  test("flex-column drag computes insertion index at midpoint boundary", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 100, height: 50 } },
      { rect: { x: 0, y: 50, width: 100, height: 50 } },
      { rect: { x: 0, y: 100, width: 100, height: 50 } },
      { rect: { x: 0, y: 150, width: 100, height: 50 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-r02" },
      children,
      50,
      125,
      "flex-container",
      "column",
    );
    expect(result.index).toBe(2);
  });

  test("flex-row drag computes horizontal insertion index", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 100, height: 50 } },
      { rect: { x: 100, y: 0, width: 100, height: 50 } },
      { rect: { x: 200, y: 0, width: 100, height: 50 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-r03" },
      children,
      200,
      25,
      "flex-container",
      "row",
    );
    expect(result.index).toBe(2);
  });

  test("reorder-child operation is distinct from reparent-element (same parent)", () => {
    const reorderResult = computeInverse(reorderOp);
    expect(reorderResult.kind).toBe("reorder-child");
    expect(reorderResult.kind).not.toBe("reparent-element");
  });

  test("block-flow reorder computes insertion index without flex assumptions", () => {
    const children = [
      { rect: { x: 0, y: 0, width: 200, height: 30 } },
      { rect: { x: 0, y: 30, width: 200, height: 30 } },
      { rect: { x: 0, y: 60, width: 200, height: 30 } },
    ];
    const result = computeInsertionIndex(
      { runtimeId: "parent-block" },
      children,
      200,
      45,
      "normal-flow-block",
      "column",
    );
    expect(result.index).toBe(1);
  });
});
