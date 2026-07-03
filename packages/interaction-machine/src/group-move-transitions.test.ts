import { computeInverse } from "@vision-control/change-ir";
import { createMultiSelectGroup, type MultiSelectGroup } from "@vision-control/editor-core";
import {
  createMultiSelectGroupId,
  type ElementRef,
  type MultiSelectMember,
} from "@vision-control/element-identity";
import { describe, expect, it } from "vitest";
import {
  buildGroupReorderOperation,
  buildGroupReparentOperation,
  createInitialGroupMoveState,
  type GroupMoveEffect,
  type GroupMoveReducerOptions,
  type GroupMoveState,
  transitionGroupMove,
} from "./group-move-transitions.js";
import { createPointerId } from "./pointer-ownership.js";

const PTR = createPointerId("ptr-1");

const member = (
  runtimeId: string,
  additions: Partial<Omit<MultiSelectMember, "runtimeId">> = {},
): MultiSelectMember => ({
  runtimeId,
  tagName: "div",
  frameId: "main",
  frameKind: "top",
  shadowKind: "light-dom",
  ...additions,
});

const ref = (runtimeId: string): ElementRef => ({ runtimeId, tagName: "div" });

/** Build a valid 3-member group sharing parent `parent`. */
const buildGroup = (parent: ElementRef): MultiSelectGroup => {
  const result = createMultiSelectGroup({
    id: createMultiSelectGroupId("grp-test"),
    members: [member("r1"), member("r2"), member("r3")],
    memberRects: [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 10, height: 10 },
      { x: 40, y: 0, width: 10, height: 10 },
    ],
    parentChains: [[parent], [parent], [parent]],
  });
  if (!result.ok) throw new Error("test group construction failed");
  return result.group;
};

/** Deterministic operation-id allocator for stable ids (flaky-class guard). */
const deterministicIds = (...ids: string[]): GroupMoveReducerOptions => {
  let i = 0;
  return { generateId: () => ids[i++] ?? "op-fallback" };
};

const findEffect = (effects: readonly GroupMoveEffect[], kind: GroupMoveEffect["kind"]) =>
  effects.find((e) => e.kind === kind);

const PARENT = ref("row-1");
const TARGET = ref("row-2");

describe("buildGroupReorderOperation — per-element refs and inverses", () => {
  it("builds a group-reorder with per-child refs parallel to group members", () => {
    const group = buildGroup(PARENT);
    const op = buildGroupReorderOperation(group, PARENT, [0, 1, 2], [2, 0, 1]);
    expect(op.kind).toBe("group-reorder");
    if (op.kind === "group-reorder") {
      expect(op.parent.runtimeId).toBe("row-1");
      expect(op.children.map((c) => c.runtimeId)).toEqual(["r1", "r2", "r3"]);
      expect(op.previousOrder).toEqual([0, 1, 2]);
      expect(op.newOrder).toEqual([2, 0, 1]);
      expect(op.runtime).toBe(false);
    }
  });

  it("computeInverse swaps previousOrder and newOrder (lossless inverse)", () => {
    const group = buildGroup(PARENT);
    const op = buildGroupReorderOperation(group, PARENT, [0, 1, 2], [2, 0, 1]);
    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("group-reorder");
    if (inverse.kind === "group-reorder") {
      expect(inverse.previousOrder).toEqual([2, 0, 1]);
      expect(inverse.newOrder).toEqual([0, 1, 2]);
      expect(inverse.inverseOf).toBe(op.id);
    }
  });

  it("rejects a parent that does not match the group commonParent (stale_state)", () => {
    const group = buildGroup(PARENT);
    expect(() =>
      buildGroupReorderOperation(group, ref("other-parent"), [0, 1, 2], [1, 0, 2]),
    ).toThrow(/common parent/i);
  });

  it("rejects order arrays whose length differs from the member count (malformed input)", () => {
    const group = buildGroup(PARENT);
    expect(() => buildGroupReorderOperation(group, PARENT, [0, 1], [1, 0])).toThrow(/parallel/i);
  });
});

describe("buildGroupReparentOperation — per-element refs and inverses", () => {
  it("builds a group-reparent with per-element refs and source/target indices", () => {
    const group = buildGroup(PARENT);
    const op = buildGroupReparentOperation(group, PARENT, [0, 1, 2], TARGET, [0, 1, 2]);
    expect(op.kind).toBe("group-reparent");
    if (op.kind === "group-reparent") {
      expect(op.elements.map((e) => e.runtimeId)).toEqual(["r1", "r2", "r3"]);
      expect(op.sourceParent.runtimeId).toBe("row-1");
      expect(op.targetParent.runtimeId).toBe("row-2");
      expect(op.sourceIndices).toEqual([0, 1, 2]);
      expect(op.targetIndices).toEqual([0, 1, 2]);
    }
  });

  it("computeInverse swaps source and target parents (lossless inverse)", () => {
    const group = buildGroup(PARENT);
    const op = buildGroupReparentOperation(group, PARENT, [0, 1, 2], TARGET, [3, 4, 5]);
    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("group-reparent");
    if (inverse.kind === "group-reparent") {
      expect(inverse.sourceParent.runtimeId).toBe("row-2");
      expect(inverse.targetParent.runtimeId).toBe("row-1");
      expect(inverse.sourceIndices).toEqual([3, 4, 5]);
      expect(inverse.targetIndices).toEqual([0, 1, 2]);
      expect(inverse.inverseOf).toBe(op.id);
    }
  });

  it("rejects index arrays whose length differs from the member count (malformed input)", () => {
    const group = buildGroup(PARENT);
    expect(() => buildGroupReparentOperation(group, PARENT, [0], TARGET, [0])).toThrow(/parallel/i);
  });
});

describe("transitionGroupMove — gesture lifecycle", () => {
  it("starts idle", () => {
    const state = createInitialGroupMoveState();
    expect(state.kind).toBe("idle");
  });

  it("begin captures the group and moves to pending", () => {
    const group = buildGroup(PARENT);
    const result = transitionGroupMove(
      createInitialGroupMoveState(),
      {
        type: "begin",
        group,
        pointerId: PTR,
      },
      deterministicIds("op-001"),
    );
    expect(result.state.kind).toBe("pending");
  });

  it("reorder event builds the operation and emits a preview effect", () => {
    const group = buildGroup(PARENT);
    const opts = deterministicIds("op-001");
    let state: GroupMoveState = createInitialGroupMoveState();
    state = transitionGroupMove(state, { type: "begin", group, pointerId: PTR }, opts).state;
    const result = transitionGroupMove(
      state,
      { type: "reorder", parent: PARENT, previousOrder: [0, 1, 2], newOrder: [2, 0, 1] },
      opts,
    );
    expect(result.state.kind).toBe("committed");
    const preview = findEffect(result.effects, "preview-group-move");
    expect(preview).toBeDefined();
  });

  it("reparent event builds the operation and emits a preview effect", () => {
    const group = buildGroup(PARENT);
    const opts = deterministicIds("op-002");
    let state: GroupMoveState = createInitialGroupMoveState();
    state = transitionGroupMove(state, { type: "begin", group, pointerId: PTR }, opts).state;
    const result = transitionGroupMove(
      state,
      {
        type: "reparent",
        sourceParent: PARENT,
        sourceIndices: [0, 1, 2],
        targetParent: TARGET,
        targetIndices: [0, 1, 2],
      },
      opts,
    );
    expect(result.state.kind).toBe("committed");
    expect(findEffect(result.effects, "preview-group-move")).toBeDefined();
  });

  it("commit event emits a commit-group-move effect carrying the operation", () => {
    const group = buildGroup(PARENT);
    const opts = deterministicIds("op-003");
    let state: GroupMoveState = createInitialGroupMoveState();
    state = transitionGroupMove(state, { type: "begin", group, pointerId: PTR }, opts).state;
    state = transitionGroupMove(
      state,
      { type: "reorder", parent: PARENT, previousOrder: [0, 1, 2], newOrder: [1, 0, 2] },
      opts,
    ).state;
    const result = transitionGroupMove(state, { type: "commit" }, opts);
    expect(findEffect(result.effects, "commit-group-move")).toBeDefined();
  });

  it("cancel event rejects the gesture", () => {
    const group = buildGroup(PARENT);
    let state: GroupMoveState = createInitialGroupMoveState();
    state = transitionGroupMove(state, { type: "begin", group, pointerId: PTR }).state;
    const result = transitionGroupMove(state, { type: "cancel", reason: "user escaped" });
    expect(result.state.kind).toBe("rejected");
    if (result.state.kind === "rejected") {
      expect(result.state.reason).toBe("user escaped");
    }
  });
});

describe("transitionGroupMove — adversarial rejection paths", () => {
  it("reorder without an active gesture is an error (malformed input)", () => {
    const result = transitionGroupMove(createInitialGroupMoveState(), {
      type: "reorder",
      parent: PARENT,
      previousOrder: [0, 1],
      newOrder: [1, 0],
    });
    expect(findEffect(result.effects, "group-move-error")).toBeDefined();
  });

  it("reorder with a stale parent (mismatched commonParent) is rejected (stale_state)", () => {
    const group = buildGroup(PARENT);
    let state: GroupMoveState = createInitialGroupMoveState();
    state = transitionGroupMove(state, { type: "begin", group, pointerId: PTR }).state;
    const result = transitionGroupMove(state, {
      type: "reorder",
      parent: ref("stale-parent"),
      previousOrder: [0, 1, 2],
      newOrder: [1, 0, 2],
    });
    expect(findEffect(result.effects, "group-move-error")).toBeDefined();
    expect(result.state.kind).toBe("rejected");
  });

  it("commit without a built operation is a no-op (no spurious commit)", () => {
    const group = buildGroup(PARENT);
    let state: GroupMoveState = createInitialGroupMoveState();
    state = transitionGroupMove(state, { type: "begin", group, pointerId: PTR }).state;
    const result = transitionGroupMove(state, { type: "commit" });
    expect(findEffect(result.effects, "commit-group-move")).toBeUndefined();
  });
});
