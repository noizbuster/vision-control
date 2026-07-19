import type { ChildBox, FlexDirection, LayoutRole } from "@vision-control/layout-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPointerId, type PointerId } from "../pointer-ownership.js";
import {
  beginReorder,
  commitReorder,
  endReorder,
  type ReorderLayoutContext,
  type ReorderTarget,
  updateReorder,
} from "./reorder.js";

const target: ReorderTarget = {
  element: { runtimeId: "child-1", tagName: "div" },
  parent: { runtimeId: "parent", tagName: "section" },
  fromIndex: 1,
  startPoint: { x: 50, y: 50 },
};

const pointerId: PointerId = createPointerId("pointer-1");

const verticalChildren: ChildBox[] = [
  { rect: { x: 0, y: 0, width: 100, height: 50 } },
  { rect: { x: 0, y: 50, width: 100, height: 50 } },
  { rect: { x: 0, y: 100, width: 100, height: 50 } },
];

const horizontalChildren: ChildBox[] = [
  { rect: { x: 0, y: 0, width: 50, height: 100 } },
  { rect: { x: 50, y: 0, width: 50, height: 100 } },
  { rect: { x: 100, y: 0, width: 50, height: 100 } },
];

const contextFor = (
  role: LayoutRole,
  children: ChildBox[] = verticalChildren,
  flexDirection: FlexDirection = "column",
): ReorderLayoutContext => ({
  parent: { runtimeId: "parent", tagName: "section" },
  children,
  layoutRole: role,
  flow:
    role === "flex-container"
      ? {
          kind: "flex",
          axis: { writingMode: "horizontal-tb", direction: "ltr", flexDirection },
        }
      : { kind: "block" },
});

describe("reorder lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
    vi.stubGlobal("crypto", { randomUUID: () => "op-reorder-0001" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("begins in drag-pending", () => {
    const state = beginReorder(target, pointerId);
    expect(state.kind).toBe("drag-pending");
    expect(state.target).toBe(target);
    expect(state.pointerId).toBe(pointerId);
  });

  it("stays drag-pending when movement is below the threshold", () => {
    const state = beginReorder(target, pointerId);
    const next = updateReorder(state, 52, 51, contextFor("normal-flow-block"));
    expect(next.kind).toBe("drag-pending");
  });

  it("transitions to dragging and computes a vertical insertion index", () => {
    const state = beginReorder(target, pointerId);
    const next = updateReorder(state, 50, 75, contextFor("flex-container"));
    expect(next.kind).toBe("dragging");
    if (next.kind !== "dragging") return;
    expect(next.toIndex).toBe(1);
    expect(next.insertion.indicator.axis).toBe("y");
  });

  it("computes horizontal insertion index for a row-direction flex-container", () => {
    const state = beginReorder(target, pointerId);
    const next = updateReorder(
      state,
      75,
      50,
      contextFor("flex-container", horizontalChildren, "row"),
    );
    expect(next.kind).toBe("dragging");
    if (next.kind !== "dragging") return;
    expect(next.toIndex).toBe(1);
    expect(next.insertion.indicator.axis).toBe("x");
  });

  it("updates toIndex while dragging", () => {
    let state = beginReorder(target, pointerId);
    state = updateReorder(state, 50, 85, contextFor("normal-flow-block"));
    state = updateReorder(state, 50, 125, contextFor("normal-flow-block"));
    expect(state.kind).toBe("dragging");
    if (state.kind !== "dragging") return;
    expect(state.toIndex).toBe(2);
  });

  it("returns null operation when dropped without crossing the threshold", () => {
    const state = beginReorder(target, pointerId);
    const result = endReorder(updateReorder(state, 52, 51, contextFor("normal-flow-block")));
    expect(result.operation).toBeNull();
    expect(result.state.kind).toBe("committed");
  });

  it("returns null operation when dropped in the original position", () => {
    let state = beginReorder(target, pointerId);
    state = updateReorder(state, 50, 75, contextFor("normal-flow-block"));
    const result = endReorder(state);
    expect(result.operation).toBeNull();
    expect(result.state.kind).toBe("committed");
  });

  it("returns a reorder-child operation when the index changes", () => {
    let state = beginReorder(target, pointerId);
    state = updateReorder(state, 50, 125, contextFor("normal-flow-block"));
    const result = endReorder(state);
    expect(result.operation).not.toBeNull();
    expect(result.state.kind).toBe("dropped");
    if (result.operation === null) return;
    expect(result.operation.kind).toBe("reorder-child");
    expect(result.operation.runtime).toBe(false);
    expect(result.operation.parent.runtimeId).toBe("parent");
    expect(result.operation.child.runtimeId).toBe("child-1");
    expect(result.operation.fromIndex).toBe(1);
    expect(result.operation.toIndex).toBe(2);
  });

  it("moves from dropped to committed", () => {
    let state = beginReorder(target, pointerId);
    state = updateReorder(state, 50, 125, contextFor("normal-flow-block"));
    const { state: dropped } = endReorder(state);
    const committed = commitReorder(dropped);
    expect(committed.kind).toBe("committed");
    if (committed.kind !== "committed") return;
    expect(committed.operation?.kind).toBe("reorder-child");
  });

  it("leaves terminal states unchanged on update", () => {
    let state = beginReorder(target, pointerId);
    state = updateReorder(state, 50, 125, contextFor("normal-flow-block"));
    const { state: dropped } = endReorder(state);
    const committed = commitReorder(dropped);
    const afterUpdate = updateReorder(committed, 0, 0, contextFor("normal-flow-block"));
    expect(afterUpdate.kind).toBe("committed");
  });
});
