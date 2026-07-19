import type { ResizeTarget } from "@vision-control/interaction-machine";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
} from "@vision-control/preview-engine";
import { describe, expect, it, vi } from "vitest";

import { createSingleResizeGesture } from "./single-resize-gesture.js";

const target: ResizeTarget = {
  element: { runtimeId: "target", selector: "#target" },
  property: "width",
  axis: "x",
  fromValue: 100,
  unit: "px",
  rect: { x: 0, y: 0, width: 100, height: 50 },
};

describe("single resize gesture", () => {
  it("keeps the first pointer as owner when a second pointer begins", () => {
    const firstHandle = document.createElement("div");
    const secondHandle = document.createElement("div");
    firstHandle.setPointerCapture = vi.fn();
    secondHandle.setPointerCapture = vi.fn();
    firstHandle.releasePointerCapture = vi.fn();
    const onCommit = vi.fn();
    const gesture = createSingleResizeGesture({
      previewEngine: createPreviewManager({ dom: createBrowserPreviewDomAdapter() }),
      onCommit,
    });

    gesture.begin({
      handleElement: firstHandle,
      handle: "e",
      event: new PointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 25 }),
      target,
    });
    gesture.begin({
      handleElement: secondHandle,
      handle: "e",
      event: new PointerEvent("pointerdown", { pointerId: 2, clientX: 100, clientY: 25 }),
      target,
    });
    gesture.end(new PointerEvent("pointerup", { pointerId: 1, clientX: 120, clientY: 25 }));

    expect(secondHandle.setPointerCapture).not.toHaveBeenCalled();
    expect(firstHandle.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ toValue: "120" }));
  });
});
