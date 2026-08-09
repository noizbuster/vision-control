import { describe, expect, it } from "vitest";
import { createPointerId } from "../pointer-ownership.js";
import { beginMove, cancelMove, commitMove, endMove, updateMove } from "./move.js";
import type { ReparentElementDescriptor } from "./reparent-feasibility.js";

const descriptor = (runtimeId: string): ReparentElementDescriptor => ({
  ref: { runtimeId, tagName: "div" },
  tagName: "div",
  sourceFile: "fixture.tsx",
});

const source = {
  element: descriptor("moving"),
  sourceParent: descriptor("source"),
  sourceIndex: 0,
  startPoint: { x: 0, y: 0 },
  sourceRect: { x: 0, y: 0, width: 20, height: 20 },
  order: 0,
  sourceParentRole: "normal-flow-block" as const,
  sourceContextPositioned: false,
};

const item = (domIndex: number, y: number, order: number = 0) => ({
  rect: { x: 0, y, width: 40, height: 40 },
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  domIndex,
  order,
  inFlow: true,
});

const candidate = (runtimeId: string, childCount: number = 3) => ({
  targetParent: descriptor(runtimeId),
  parentRect: { x: 0, y: 0, width: 100, height: 200 },
  childCount,
  items: Array.from({ length: childCount }, (_, index) => item(index, index * 50)),
  layoutRole: "normal-flow-block" as const,
  targetContextPositioned: false,
  flow: { kind: "block" as const, writingMode: "horizontal-tb" as const },
});

describe("Move session", () => {
  it("keeps a threshold-pending press inert and builds a same-parent reorder on release", () => {
    const pending = beginMove(source, createPointerId("pointer-1"));
    const belowThreshold = updateMove(pending, { x: 3, y: 0 }, candidate("source"));
    const dragging = updateMove(belowThreshold, { x: 5, y: 180 }, candidate("source"));
    const result = endMove(dragging);

    expect(belowThreshold).toBe(pending);
    expect(dragging).toMatchObject({
      kind: "dragging",
      evaluation: { kind: "valid", intent: "reorder" },
    });
    expect(result).toMatchObject({
      operation: {
        kind: "reorder-child",
        parent: { runtimeId: "source" },
        fromIndex: 0,
        toIndex: 3,
      },
      state: { kind: "dropped" },
    });
  });

  it("uses only the latest candidate across same-parent and cross-parent handoffs", () => {
    const pending = beginMove(source, createPointerId("pointer-2"));
    const sourceDrag = updateMove(pending, { x: 5, y: 180 }, candidate("source"));
    const targetDrag = updateMove(sourceDrag, { x: 8, y: 180 }, candidate("target-a", 2));
    const returnDrag = updateMove(targetDrag, { x: 10, y: 20 }, candidate("source"));
    const finalDrag = updateMove(returnDrag, { x: 12, y: 180 }, candidate("target-b", 2));
    const result = endMove(finalDrag);

    expect(sourceDrag).toMatchObject({
      kind: "dragging",
      evaluation: { kind: "valid", intent: "reorder" },
    });
    expect(targetDrag).toMatchObject({
      kind: "dragging",
      evaluation: { kind: "valid", intent: "reparent" },
    });
    expect(returnDrag).toMatchObject({
      kind: "dragging",
      evaluation: { kind: "valid", intent: "reorder" },
    });
    expect(result.operation).toMatchObject({
      kind: "reparent-element",
      targetParent: { runtimeId: "target-b" },
    });
  });

  it("treats original position, invalid targets, and cancellation as non-operations", () => {
    const pending = beginMove(source, createPointerId("pointer-3"));
    const original = updateMove(pending, { x: 5, y: 10 }, candidate("source"));
    const originalResult = endMove(original);
    const noTarget = updateMove(
      beginMove(source, createPointerId("pointer-4")),
      { x: 5, y: 10 },
      null,
    );
    const invalidResult = endMove(noTarget);
    const cancelled = cancelMove(noTarget, "escape");

    expect(originalResult).toMatchObject({
      operation: null,
      diagnostic: null,
      state: { kind: "committed", operation: null },
    });
    expect(invalidResult).toMatchObject({
      operation: null,
      diagnostic: { code: "no-target" },
      state: { kind: "cancelled", reason: "invalid-drop" },
    });
    expect(endMove(cancelled)).toEqual({ state: cancelled, operation: null, diagnostic: null });
    expect(updateMove(cancelled, { x: 99, y: 99 }, candidate("target"))).toBe(cancelled);
  });

  it("rejects unsafe reparenting and makes terminal lifecycle calls idempotent", () => {
    const unsafeCandidate = {
      ...candidate("shadow-target", 0),
      targetParent: { ...descriptor("shadow-target"), isInShadowRoot: true },
    };
    const dragging = updateMove(
      beginMove(source, createPointerId("pointer-5")),
      { x: 5, y: 20 },
      unsafeCandidate,
    );
    const invalid = endMove(dragging);

    expect(dragging).toMatchObject({
      kind: "dragging",
      evaluation: { kind: "invalid", diagnostic: { code: "unsafe-reparent" } },
    });
    expect(invalid).toMatchObject({
      operation: null,
      state: { kind: "cancelled", reason: "invalid-drop" },
    });

    const dropped = endMove(
      updateMove(
        beginMove(source, createPointerId("pointer-6")),
        { x: 5, y: 180 },
        candidate("target", 2),
      ),
    ).state;
    expect(dropped.kind).toBe("dropped");
    const committed = commitMove(dropped);
    expect(committed).toMatchObject({ kind: "committed", operation: { kind: "reparent-element" } });
    expect(commitMove(committed)).toBe(committed);
    expect(cancelMove(committed, "release-validation-failed")).toBe(committed);
  });
});
