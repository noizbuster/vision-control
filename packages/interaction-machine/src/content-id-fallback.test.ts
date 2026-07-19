import { createMultiSelectGroup, type MultiSelectGroup } from "@vision-control/editor-core";
import {
  createMultiSelectGroupId,
  type ElementRef,
  type MultiSelectMember,
} from "@vision-control/element-identity";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildGroupReorderOperation,
  buildGroupReparentOperation,
} from "./group-move-transitions.js";
import {
  createInitialMultiSelectState,
  transitionMultiSelect,
} from "./multi-select-transitions.js";
import {
  beginReorder,
  endReorder,
  type ReorderLayoutContext,
  updateReorder,
} from "./operations/reorder.js";
import {
  beginReparent,
  type CandidateContainer,
  endReparent,
  evaluateDropTarget,
} from "./operations/reparent.js";
import { createResizeOperation } from "./operations/resize.js";
import { createPointerId } from "./pointer-ownership.js";

const parent: ElementRef = { runtimeId: "parent", tagName: "section" };
const target: ElementRef = { runtimeId: "target", tagName: "section" };
const pointerId = createPointerId("pointer-1");

const member = (runtimeId: string): MultiSelectMember => ({
  runtimeId,
  tagName: "div",
  frameId: "main",
  frameKind: "top",
  shadowKind: "light-dom",
});

const buildGroup = (): MultiSelectGroup => {
  const result = createMultiSelectGroup({
    id: createMultiSelectGroupId("group-test"),
    members: [member("one"), member("two")],
    memberRects: [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 10, height: 10 },
    ],
    parentChains: [[parent], [parent]],
  });
  if (!result.ok) throw new Error("test group construction failed");
  return result.group;
};

describe("content-safe id generation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds content-reachable operations when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });

    const reorderContext: ReorderLayoutContext = {
      parent,
      children: [
        { rect: { x: 0, y: 0, width: 100, height: 50 } },
        { rect: { x: 0, y: 50, width: 100, height: 50 } },
      ],
      layoutRole: "normal-flow-block",
      flow: { kind: "block" },
    };
    const reorder = endReorder(
      updateReorder(
        beginReorder(
          {
            element: { runtimeId: "child", tagName: "div" },
            parent,
            fromIndex: 0,
            startPoint: { x: 0, y: 0 },
          },
          pointerId,
        ),
        0,
        75,
        reorderContext,
      ),
    );

    const resize = createResizeOperation();
    resize.beginResize("e", pointerId, {
      element: { runtimeId: "resized" },
      property: "width",
      axis: "x",
      fromValue: 100,
      unit: "px",
      rect: { x: 0, y: 0, width: 100, height: 50 },
    });
    resize.updateResize(10, 0, { shift: false, alt: false });
    const resizeResult = resize.endResize();

    const container: CandidateContainer = {
      parent: { ref: target, tagName: "section" },
      layoutRole: "normal-flow-block",
      rect: { x: 0, y: 0, width: 100, height: 100 },
      children: [],
    };
    const { session } = evaluateDropTarget(
      beginReparent(
        pointerId,
        { ref: { runtimeId: "moved", tagName: "div" }, tagName: "div" },
        { ref: parent, tagName: "section" },
        0,
      ),
      10,
      10,
      [container],
    );
    const reparent = endReparent(session);
    const group = buildGroup();
    const groupReorder = buildGroupReorderOperation(group, parent, [0, 1], [1, 0]);
    const groupReparent = buildGroupReparentOperation(group, parent, [0, 1], target, [0, 1]);
    const multiSelect = transitionMultiSelect(createInitialMultiSelectState(), {
      type: "marquee-select",
      marqueeRect: { x: 0, y: 0, width: 100, height: 20 },
      members: [member("one"), member("two")],
      memberRects: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 0, width: 10, height: 10 },
      ],
      parentChains: [[parent], [parent]],
    });

    expect(reorder.operation?.id).toMatch(/-/);
    expect(resizeResult?.operation.id).toMatch(/-/);
    expect(reparent.status).toBe("committed");
    if (reparent.status === "committed") expect(reparent.operation.id).toMatch(/-/);
    expect(groupReorder.id).toMatch(/-/);
    expect(groupReparent.id).toMatch(/-/);
    expect(multiSelect.state.group?.id).toMatch(/-/);
  });
});
