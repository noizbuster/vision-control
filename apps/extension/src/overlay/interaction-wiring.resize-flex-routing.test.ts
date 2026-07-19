import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createFlexPairDom,
  selectFlexPrimary,
} from "../components/interaction/flex-pair-resize-test-fixture.js";
import {
  createInteractionHarness,
  dispatchPointer,
  flushRaf,
  type InteractionHarness,
  prepareResizeHandle,
  requireSelectionContext,
  setRect,
} from "./interaction-wiring.test-fixtures.js";

describe("interaction wiring flex resize routing", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  it("routes a cardinal cross-axis handle to single height and ignores panel flex-basis", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    harness.bus.emit("resize-candidate-select", {
      kind: "css-property",
      property: "flex-basis",
    });
    const handle = prepareResizeHandle(harness, "s");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 80, clientY: 80, pointerId: 31 });
    dispatchPointer(handle, "pointerup", { clientX: 80, clientY: 100, pointerId: 31 });

    // Then
    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("resize-element");
    if (operation?.kind !== "resize-element") return;
    expect(operation.property).toBe("height");
    expect(operation.fromValue).toBe("80");
    expect(operation.toValue).toBe("100");
  });

  it("disables flex corners with a typed reason and records nothing", () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "se");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 80, pointerId: 32 });

    // Then
    expect(harness.diagnostics).toContainEqual({
      kind: "flex-pair-disabled",
      reason: "corner-handle",
      message: "corner handles are disabled for contextual flex pair resize",
    });
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(handle.setPointerCapture).not.toHaveBeenCalled();
  });

  it("doubles cardinal pair delta with Alt", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 33 });
    dispatchPointer(handle, "pointerup", {
      clientX: 180,
      clientY: 40,
      pointerId: 33,
      altKey: true,
    });
    await flushRaf();

    // Then
    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("resize-flex-pair");
    if (operation?.kind !== "resize-flex-pair") return;
    expect(operation.delta).toBe(40);
  });

  it("keeps Shift inert on cardinal pair handles", async () => {
    // Given
    const fixture = createFlexPairDom();
    selectFlexPrimary(harness, fixture);
    const handle = prepareResizeHandle(harness, "e");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 160, clientY: 40, pointerId: 34 });
    dispatchPointer(handle, "pointerup", {
      clientX: 200,
      clientY: 70,
      pointerId: 34,
      shiftKey: true,
    });
    await flushRaf();

    // Then
    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("resize-flex-pair");
    if (operation?.kind !== "resize-flex-pair") return;
    expect(operation.delta).toBe(40);
  });

  it("retains Shift aspect locking and Alt doubling for block corners", () => {
    // Given
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:100px;height:50px";
    document.body.appendChild(target);
    setRect(target, { x: 0, y: 0, width: 100, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(target));
    const handle = prepareResizeHandle(harness, "ne");

    // When
    dispatchPointer(handle, "pointerdown", { clientX: 100, clientY: 0, pointerId: 35 });
    dispatchPointer(handle, "pointerup", {
      clientX: 120,
      clientY: -30,
      pointerId: 35,
      shiftKey: true,
      altKey: true,
    });

    // Then
    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("resize-element");
    if (operation?.kind !== "resize-element") return;
    expect(operation.toValue).toBe("220");
  });
});
