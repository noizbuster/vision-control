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
  test.fixme("flex-column drag shows insertion indicator between items", async ({ page }) => {
    // Given: a vertical flex container with 4 items on the MVP Board fixture.
    // When: the user drags item 2 toward the gap between items 0 and 1.
    // Then: an insertion indicator line appears at the computed index.
    // Assert: indicator position matches computeInsertionIndex output.
  });

  test.fixme("flex-row drag shows horizontal insertion indicator", async ({ page }) => {
    // Given: a horizontal flex container (flex-direction: row).
    // When: the user drags an item left/right.
    // Then: the indicator is a vertical line at the horizontal midpoint boundary.
    // Assert: indicator x-coordinate matches the child boundary.
  });

  test.fixme("drop produces a reorder-child operation (not reparent)", async ({ page }) => {
    // Given: a drag completes within the same parent container.
    // When: pointerup fires.
    // Then: the committed operation has kind "reorder-child".
    // Assert: operation.parent === operation source parent (same element).
  });

  test.fixme("block-flow reorder works for non-flex containers", async ({ page }) => {
    // Given: a block container (display: block) with stacked children.
    // When: the user drags a child to a new position.
    // Then: reorder-child is produced with the correct indices.
    // Assert: no flex-specific assumptions are made.
  });
});
