import { expect, test } from "@playwright/test";

import { computeInverse } from "@vision-control/change-ir";
import { createMultiSelectGroup } from "@vision-control/editor-core";
import { createMultiSelectGroupId } from "@vision-control/element-identity";
import { createPointerId } from "@vision-control/interaction-machine";
import { classifyGroupMove } from "@vision-control/layout-engine";

/**
 * @group-move — VC-V1V2-06 group move and group source-intent compilation.
 *
 * Verifies the three group-move flavors (same-parent sibling reorder, group
 * reparent, positioned-context free-move) and the D41 guard (normal-flow group
 * free-move is rejected, never auto-converted to absolute positioning). The
 * unit-level tests exercise the full chain: classifyGroupMove →
 * transitionGroupMove → buildGroupReorderOperation / buildGroupReparentOperation
 * → computeInverse. Browser tests require the built extension in Chromium.
 */

const PARENT = { runtimeId: "row-1", tagName: "div" };
const TARGET = { runtimeId: "row-2", tagName: "div" };

const buildGroup = (parent: typeof PARENT) => {
  const result = createMultiSelectGroup({
    id: createMultiSelectGroupId("grp-e2e"),
    members: [
      {
        runtimeId: "card-a",
        tagName: "div",
        frameId: "main",
        frameKind: "top",
        shadowKind: "light-dom",
      },
      {
        runtimeId: "card-b",
        tagName: "div",
        frameId: "main",
        frameKind: "top",
        shadowKind: "light-dom",
      },
      {
        runtimeId: "card-c",
        tagName: "div",
        frameId: "main",
        frameKind: "top",
        shadowKind: "light-dom",
      },
    ],
    memberRects: [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 50, width: 100, height: 50 },
      { x: 0, y: 100, width: 100, height: 50 },
    ],
    parentChains: [[parent], [parent], [parent]],
  });
  if (!result.ok) throw new Error("group construction failed");
  return result.group;
};

test.describe("@group-move unit", () => {
  test("same-parent sibling reorder produces a group-reorder with per-element refs", async () => {
    const { buildGroupReorderOperation } = await import("@vision-control/interaction-machine");
    const group = buildGroup(PARENT);
    const op = buildGroupReorderOperation(group, PARENT, [0, 1, 2], [2, 0, 1]);
    expect(op.kind).toBe("group-reorder");
    if (op.kind === "group-reorder") {
      expect(op.children.map((c) => c.runtimeId)).toEqual(["card-a", "card-b", "card-c"]);
      expect(op.previousOrder).toEqual([0, 1, 2]);
      expect(op.newOrder).toEqual([2, 0, 1]);
    }
  });

  test("group-reorder inverse swaps the orderings (lossless)", async () => {
    const { buildGroupReorderOperation } = await import("@vision-control/interaction-machine");
    const group = buildGroup(PARENT);
    const op = buildGroupReorderOperation(group, PARENT, [0, 1, 2], [2, 0, 1]);
    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("group-reorder");
    if (inverse.kind === "group-reorder") {
      expect(inverse.previousOrder).toEqual([2, 0, 1]);
      expect(inverse.newOrder).toEqual([0, 1, 2]);
    }
  });

  test("group reparent produces a group-reparent with per-element refs and indices", async () => {
    const { buildGroupReparentOperation } = await import("@vision-control/interaction-machine");
    const group = buildGroup(PARENT);
    const op = buildGroupReparentOperation(group, PARENT, [0, 1, 2], TARGET, [3, 4, 5]);
    expect(op.kind).toBe("group-reparent");
    if (op.kind === "group-reparent") {
      expect(op.elements.map((e) => e.runtimeId)).toEqual(["card-a", "card-b", "card-c"]);
      expect(op.sourceParent.runtimeId).toBe("row-1");
      expect(op.targetParent.runtimeId).toBe("row-2");
      expect(op.targetIndices).toEqual([3, 4, 5]);
    }
  });

  test("group-reparent inverse swaps source and target parents", async () => {
    const { buildGroupReparentOperation } = await import("@vision-control/interaction-machine");
    const group = buildGroup(PARENT);
    const op = buildGroupReparentOperation(group, PARENT, [0, 1, 2], TARGET, [3, 4, 5]);
    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("group-reparent");
    if (inverse.kind === "group-reparent") {
      expect(inverse.sourceParent.runtimeId).toBe("row-2");
      expect(inverse.targetParent.runtimeId).toBe("row-1");
    }
  });

  test("normal-flow group free-move is REJECTED (D41, no silent absolute positioning)", () => {
    const candidate = classifyGroupMove({
      sameParent: true,
      sourceParentRole: "flex-container",
      targetParentRole: "flex-container",
      validContentModel: true,
      userIntent: "free-move",
    });
    expect(candidate.kind).toBe("unsupported-group-free-move");
    if (candidate.kind === "unsupported-group-free-move") {
      expect(candidate.message).not.toMatch(/position:\s*absolute/i);
    }
  });

  test("positioned-context group free-move requires explicit opt-in", () => {
    const withoutOptIn = classifyGroupMove({
      sameParent: true,
      sourceParentRole: "absolute-positioned",
      targetParentRole: "absolute-positioned",
      sourceContextPositioned: true,
      targetContextPositioned: true,
    });
    expect(withoutOptIn.kind).toBe("unsupported-group-free-move");

    const withOptIn = classifyGroupMove({
      sameParent: true,
      sourceParentRole: "absolute-positioned",
      targetParentRole: "absolute-positioned",
      sourceContextPositioned: true,
      targetContextPositioned: true,
      userIntent: "free-move",
    });
    expect(withOptIn.kind).toBe("positioned-free-move");
  });

  test("group reparent carries an ownership-risk warning when source-origins differ", () => {
    const candidate = classifyGroupMove({
      sameParent: false,
      sourceParentRole: "flex-container",
      targetParentRole: "flex-container",
      validContentModel: true,
      ownershipRisk: true,
    });
    expect(candidate.kind).toBe("group-reparent");
    if (candidate.kind === "group-reparent") {
      expect(candidate.ownershipRisk).toBe(true);
      expect(candidate.warning).toMatch(/ownership/i);
    }
  });

  test("the reducer records a group-reorder via the commit effect", async () => {
    const { transitionGroupMove, createInitialGroupMoveState } = await import(
      "@vision-control/interaction-machine"
    );
    const group = buildGroup(PARENT);
    const ptr = createPointerId("ptr-e2e");
    let state = createInitialGroupMoveState();
    state = transitionGroupMove(state, { type: "begin", group, pointerId: ptr }).state;
    state = transitionGroupMove(state, {
      type: "reorder",
      parent: PARENT,
      previousOrder: [0, 1, 2],
      newOrder: [1, 0, 2],
    }).state;
    const result = transitionGroupMove(state, { type: "commit" });
    const commit = result.effects.find((e) => e.kind === "commit-group-move");
    expect(commit).toBeDefined();
  });
});

test.describe("@group-move browser", () => {
  // OUT: panel-context — group-reorder/reparent ops record to the journal which lives in the DevTools panel context; the overlay harness loads the content runtime + overlay only and cannot open the panel. D41 free-move rejection produces no overlay signal. Unit tests above cover classifyGroupMove → buildGroup*Operation → computeInverse end-to-end.
  test.fixme("move two adjacent cards as a group within the same flex parent", async ({ page }) => {
    // Given: a multi-select group of three sibling `.card` elements in a flex-row.
    // When: the user drags two selected cards to a new position in the same parent.
    // Then: a `group-reorder` operation is recorded with per-child refs and inverses.
    // Assert: the journal entry kind === "group-reorder" and newOrder reflects the drop.
  });

  // OUT: panel-context — group-reparent records to the panel journal; the ownership-risk warning renders in the inspector. Overlay harness cannot open the panel context.
  test.fixme("reparent a multi-select group to a compatible parent", async ({ page }) => {
    // Given: a multi-select group in container A.
    // When: the user drags the group onto container B (same frame, open shadow root).
    // Then: a `group-reparent` operation is recorded; ownership-risk warning shows
    //       when a member's source-origin differs from B's.
    // Assert: journal kind === "group-reparent"; inspector shows the ownership warning.
  });

  // OUT: panel-context — D41 free-move rejection produces no overlay signal; the diagnostic surfaces in the DevTools panel inspector.
  test.fixme("normal-flow group free-move is rejected with a diagnostic (D41)", async ({
    page,
  }) => {
    // Given: a multi-select group in a normal-flow flex container.
    // When: the user attempts a free-move drag (arbitrary positioning, not an insertion slot).
    // Then: the move is REJECTED with `unsupported-group-free-move`; NO `position: absolute`
    //       source intent is produced.
    // Assert: no group operation recorded; diagnostic surfaces in the inspector.
  });

  // OUT: panel-context — per-member style-edit ops with free-move record to the panel journal; the overlay harness cannot open the panel context.
  test.fixme("positioned-context group free-move works with explicit opt-in", async ({ page }) => {
    // Given: a multi-select group of absolutely-positioned children.
    // When: the user opts into free-move (explicit intent) and drags the group.
    // Then: per-member style-edit operations carry `userIntent: "free-move"`.
    // Assert: operations kind === "style-edit" with the free-move flag.
  });
});
