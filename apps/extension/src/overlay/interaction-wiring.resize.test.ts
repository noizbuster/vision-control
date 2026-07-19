import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSingleResizeTarget } from "../components/interaction/resize-selection-context.js";
import { captureSelectionContext } from "./interaction-selection-capture.js";
import {
  assertNoPositionElement,
  createInteractionHarness,
  dispatchPointer,
  flushRaf,
  type InteractionHarness,
  prepareResizeHandle,
  requireSelectionContext,
  setRect,
} from "./interaction-wiring.test-fixtures.js";

describe("interaction wiring resize", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });
  afterEach(() => {
    harness.dispose();
  });

  it("keeps block east resize as one resize-element with a real computed start", async () => {
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 10, y: 10, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    const handle = prepareResizeHandle(harness, "e");

    dispatchPointer(handle, "pointerdown", { clientX: 110, clientY: 35, pointerId: 1 });
    dispatchPointer(handle, "pointermove", { clientX: 160, clientY: 35, pointerId: 1 });
    await flushRaf();
    dispatchPointer(handle, "pointerup", { clientX: 160, clientY: 35, pointerId: 1 });

    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    const operation = operations[0];
    expect(operation?.kind).toBe("resize-element");
    if (operation?.kind === "resize-element") {
      expect(operation.property).toBe("width");
      expect(operation.fromValue).toBe("100");
      expect(operation.toValue).toBe("150");
    }
    assertNoPositionElement(operations);
  });

  it("commits pointerup coordinates before the scheduled preview frame", () => {
    // Given
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 0, y: 0, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 25, pointerId: 6 });
    dispatchPointer(handle, "pointermove", { clientX: 120, clientY: 25, pointerId: 6 });

    // When
    dispatchPointer(handle, "pointerup", { clientX: 160, clientY: 25, pointerId: 6 });

    // Then
    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    const operation = operations[0];
    expect(operation?.kind).toBe("resize-element");
    if (operation?.kind === "resize-element") expect(operation.toValue).toBe("160");
    expect(harness.previewManager.activeCount).toBe(0);
    expect(handle.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it("commits pointerup coordinates after an older preview frame", async () => {
    // Given
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 0, y: 0, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 25, pointerId: 7 });
    dispatchPointer(handle, "pointermove", { clientX: 120, clientY: 25, pointerId: 7 });
    await flushRaf();
    expect(harness.previewManager.activeCount).toBe(1);

    // When
    dispatchPointer(handle, "pointerup", { clientX: 160, clientY: 25, pointerId: 7 });

    // Then
    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    const operation = operations[0];
    expect(operation?.kind).toBe("resize-element");
    if (operation?.kind === "resize-element") expect(operation.toValue).toBe("160");
    expect(harness.previewManager.activeCount).toBe(0);
    expect(handle.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it("keeps cardinal cross-axis height resize as one resize-element", async () => {
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 10, y: 10, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    harness.bus.emit("resize-candidate-select", { kind: "css-property", property: "height" });
    const handle = prepareResizeHandle(harness, "s");

    dispatchPointer(handle, "pointerdown", { clientX: 60, clientY: 60, pointerId: 2 });
    dispatchPointer(handle, "pointermove", { clientX: 60, clientY: 80, pointerId: 2 });
    await flushRaf();
    dispatchPointer(handle, "pointerup", { clientX: 60, clientY: 80, pointerId: 2 });

    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("resize-element");
    if (operation?.kind === "resize-element") {
      expect(operation.property).toBe("height");
      expect(operation.fromValue).toBe("50");
      expect(operation.toValue).toBe("70");
    }
  });

  it("reports malformed candidate selections without recording an operation", () => {
    harness.bus.emit("resize-candidate-select", { kind: "css-property", property: 1 });

    expect(harness.diagnostics).toEqual([
      expect.objectContaining({ kind: "invalid-resize-candidate" }),
    ]);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
  });

  it("returns diagnostics for detached selection and invalid computed starts", () => {
    const detached = document.createElement("div");
    expect(captureSelectionContext(detached)).toEqual({
      ok: false,
      diagnostic: "disconnected-element",
    });

    detached.style.width = "100px";
    document.body.appendChild(detached);
    setRect(detached, { x: 0, y: 0, width: 100, height: 50 });
    const context = requireSelectionContext(detached).resize;
    const invalidContext = {
      ...context,
      target: { ...context.target, style: { ...context.target.style, width: "calc(bad)" } },
    };
    expect(createSingleResizeTarget(invalidContext, "width")).toEqual({
      ok: false,
      diagnostic: "invalid-computed-start",
      property: "width",
      value: "calc(bad)",
    });
    harness.controllers.resize.attach(invalidContext);
    const handle = prepareResizeHandle(harness, "e");
    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 25, pointerId: 8 });
    dispatchPointer(handle, "pointerup", { clientX: 120, clientY: 25, pointerId: 8 });
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);

    const invalidRect = document.createElement("div");
    document.body.appendChild(invalidRect);
    setRect(invalidRect, { x: Number.NaN, y: 0, width: 100, height: 50 });
    expect(captureSelectionContext(invalidRect)).toEqual({ ok: false, diagnostic: "invalid-rect" });
  });

  it("cancels a pending frame without leaking preview or recording", async () => {
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 0, y: 0, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    const handle = prepareResizeHandle(harness, "e");

    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 25, pointerId: 3 });
    dispatchPointer(handle, "pointermove", { clientX: 140, clientY: 25, pointerId: 3 });
    dispatchPointer(handle, "pointercancel", { clientX: 140, clientY: 25, pointerId: 3 });
    dispatchPointer(handle, "pointercancel", { clientX: 140, clientY: 25, pointerId: 3 });
    await flushRaf();

    expect(harness.previewManager.activeCount).toBe(0);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(handle.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it("rolls back preview when pointer capture is lost without double-releasing ownership", async () => {
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 0, y: 0, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    const handle = prepareResizeHandle(harness, "e");

    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 25, pointerId: 4 });
    dispatchPointer(handle, "pointermove", { clientX: 130, clientY: 25, pointerId: 4 });
    await flushRaf();
    expect(harness.previewManager.activeCount).toBe(1);
    dispatchPointer(handle, "lostpointercapture", { pointerId: 4 });

    expect(harness.previewManager.activeCount).toBe(0);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(handle.releasePointerCapture).not.toHaveBeenCalled();
  });

  it("rolls back an applied preview on pointercancel and releases ownership once", async () => {
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 0, y: 0, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    const handle = prepareResizeHandle(harness, "e");

    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 25, pointerId: 5 });
    dispatchPointer(handle, "pointermove", { clientX: 130, clientY: 25, pointerId: 5 });
    await flushRaf();
    expect(harness.previewManager.activeCount).toBe(1);
    dispatchPointer(handle, "pointercancel", { pointerId: 5 });
    dispatchPointer(handle, "pointercancel", { pointerId: 5 });

    expect(harness.previewManager.activeCount).toBe(0);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(handle.releasePointerCapture).toHaveBeenCalledTimes(1);
  });
});
