import { computeInverse } from "@vision-control/change-ir";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertNoPositionElement,
  createInteractionHarness,
  dispatchPointer,
  type InteractionHarness,
  interactionOperationMessages,
  requireSelectionContext,
  setRect,
  visibleDropIndicator,
} from "./interaction-wiring.test-fixtures.js";

describe("interaction wiring move reorder", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });
  afterEach(() => {
    harness.dispose();
  });

  const makeRow = (): readonly [HTMLDivElement, HTMLDivElement, HTMLDivElement] => {
    const parent = document.createElement("div");
    parent.style.cssText = "display:flex;flex-direction:row";
    const first = document.createElement("div");
    const second = document.createElement("div");
    parent.append(first, second);
    document.body.appendChild(parent);
    setRect(parent, { x: 0, y: 0, width: 180, height: 60 });
    setRect(first, { x: 0, y: 0, width: 60, height: 40 });
    setRect(second, { x: 70, y: 0, width: 60, height: 40 });
    return [parent, first, second];
  };

  it("keeps held same-parent drag on reorder and commits only on release", () => {
    const [parent, first, second] = makeRow();
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(first));
    vi.spyOn(harness.previewManager, "applyOperation");

    dispatchPointer(first, "pointerdown", { clientX: 10, clientY: 20, pointerId: 10 });
    dispatchPointer(document, "pointermove", { clientX: 120, clientY: 20, pointerId: 10 });

    expect(visibleDropIndicator(harness.overlay.overlayContainer).style.display).toBe("block");
    expect([...parent.children]).toEqual([first, second]);
    expect(harness.previewManager.applyOperation).not.toHaveBeenCalled();
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.controllers.getJournal().entries).toHaveLength(0);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(0);

    dispatchPointer(document, "pointerup", { clientX: 120, clientY: 20, pointerId: 10 });

    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.kind).toBe("reorder-child");
    expect([...parent.children]).toEqual([second, first]);
    expect(harness.previewManager.applyOperation).toHaveBeenCalledTimes(1);
    expect(harness.controllers.getJournal().entries).toHaveLength(1);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(1);
    assertNoPositionElement(operations);
  });

  it("records a trailing index that round-trips through inverse preview", () => {
    const parent = document.createElement("div");
    parent.style.cssText = "display:flex;flex-direction:row";
    const first = document.createElement("div");
    const second = document.createElement("div");
    const third = document.createElement("div");
    parent.append(first, second, third);
    document.body.appendChild(parent);
    setRect(parent, { x: 0, y: 0, width: 300, height: 60 });
    setRect(first, { x: 0, y: 0, width: 60, height: 40 });
    setRect(second, { x: 100, y: 0, width: 60, height: 40 });
    setRect(third, { x: 200, y: 0, width: 60, height: 40 });
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(first));

    dispatchPointer(first, "pointerdown", { clientX: 10, clientY: 20, pointerId: 21 });
    dispatchPointer(document, "pointermove", { clientX: 290, clientY: 20, pointerId: 21 });
    dispatchPointer(document, "pointerup", { clientX: 290, clientY: 20, pointerId: 21 });

    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("reorder-child");
    if (operation?.kind !== "reorder-child") return;
    expect(operation.fromIndex).toBe(0);
    expect(operation.toIndex).toBe(2);
    expect([...parent.children]).toEqual([second, third, first]);
    harness.previewManager.applyOperation(computeInverse(operation));
    expect([...parent.children]).toEqual([first, second, third]);
  });

  it("does not mutate or record a same-parent pointer no-op", () => {
    const [parent, first, second] = makeRow();
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(first));
    vi.spyOn(harness.previewManager, "applyOperation");

    dispatchPointer(first, "pointerdown", { clientX: 10, clientY: 20, pointerId: 16 });
    dispatchPointer(document, "pointerup", { clientX: 10, clientY: 20, pointerId: 16 });

    expect([...parent.children]).toEqual([first, second]);
    expect(harness.previewManager.applyOperation).not.toHaveBeenCalled();
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(0);
  });

  it("never emits position-element from normal-flow keyboard movement", () => {
    const [parent, first] = makeRow();
    expect(parent.style.display).toBe("flex");
    harness.controllers.attach();
    harness.controllers.reorder.setSelectedElement(first);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );

    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.kind).toBe("reorder-child");
    assertNoPositionElement(operations);
  });

  it("detach stops keyboard reorder recording", () => {
    const [, first] = makeRow();
    harness.controllers.attach();
    harness.controllers.reorder.setSelectedElement(first);
    harness.controllers.detach();

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
  });
});
