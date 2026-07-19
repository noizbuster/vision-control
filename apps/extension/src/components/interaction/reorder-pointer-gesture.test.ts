import type {
  ReorderLayoutContext,
  ReorderResult,
  ReorderTarget,
} from "@vision-control/interaction-machine";
import { afterEach, describe, expect, it } from "vitest";

import { createReorderPointerGesture } from "./reorder-pointer-gesture.js";

const context: ReorderLayoutContext = {
  parent: { runtimeId: "parent", tagName: "div" },
  children: [
    { rect: { x: 70, y: 0, width: 50, height: 40 } },
    { rect: { x: 0, y: 0, width: 50, height: 40 } },
  ],
  layoutRole: "flex-container",
  flow: {
    kind: "flex",
    axis: { writingMode: "horizontal-tb", direction: "ltr", flexDirection: "row-reverse" },
  },
};

const target: ReorderTarget = {
  element: { runtimeId: "first", tagName: "div" },
  parent: context.parent,
  fromIndex: 0,
  startPoint: { x: 95, y: 20 },
};

const dispatchPointer = (type: string, pointerId: number, x: number): void => {
  document.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      clientX: x,
      clientY: 20,
      bubbles: true,
      cancelable: true,
    }),
  );
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createReorderPointerGesture", () => {
  it("keeps held updates operation-free and releases exactly one operation", () => {
    const results: ReorderResult[] = [];
    const gesture = createReorderPointerGesture({
      document,
      resolveStart: () => target,
      readContext: () => context,
      onStateChange: () => {},
      onRelease: (result) => results.push(result),
    });
    gesture.attach();

    dispatchPointer("pointerdown", 1, 95);
    dispatchPointer("pointermove", 1, 10);
    expect(results).toHaveLength(0);
    dispatchPointer("pointerup", 1, 10);
    dispatchPointer("pointerup", 1, 10);

    expect(results).toHaveLength(1);
    expect(results[0]?.operation?.kind).toBe("reorder-child");
    expect(results[0]?.operation?.toIndex).toBe(2);
    gesture.detach();
  });

  it("does not let another pointer move, cancel, or release the owner", () => {
    const results: ReorderResult[] = [];
    const gesture = createReorderPointerGesture({
      document,
      resolveStart: () => target,
      readContext: () => context,
      onStateChange: () => {},
      onRelease: (result) => results.push(result),
    });
    gesture.attach();

    dispatchPointer("pointerdown", 2, 95);
    dispatchPointer("pointermove", 3, 10);
    dispatchPointer("pointercancel", 3, 10);
    dispatchPointer("pointerup", 3, 10);
    expect(results).toHaveLength(0);
    dispatchPointer("pointerup", 2, 10);

    expect(results).toHaveLength(1);
    gesture.detach();
  });
});
