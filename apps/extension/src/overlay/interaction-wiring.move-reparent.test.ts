import type { Operation } from "@vision-control/change-ir";
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

describe("interaction wiring move reparent", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });
  afterEach(() => {
    harness.dispose();
  });

  it("defers DOM mutation, preview, and journaling until release", () => {
    const source = document.createElement("section");
    const target = document.createElement("section");
    const child = document.createElement("div");
    source.appendChild(child);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 120 });
    setRect(target, { x: 200, y: 0, width: 160, height: 160 });
    setRect(child, { x: 10, y: 10, width: 60, height: 30 });
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(child));
    const sequence: string[] = [];
    const synchronized: Operation[] = [];
    const applyOperation = harness.previewManager.applyOperation;
    const send = harness.bus.send;
    harness.setOperationObserver((operation) => {
      synchronized.push(operation);
      sequence.push("sync");
    });
    vi.spyOn(harness.previewManager, "applyOperation").mockImplementation((operation) => {
      sequence.push("apply");
      return applyOperation(operation);
    });
    vi.spyOn(harness.bus, "send").mockImplementation((route, message) => {
      if (message.messageType === "interaction-operation") sequence.push("record");
      send(route, message);
    });

    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 20, pointerId: 9 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 50, pointerId: 9 });

    expect(child.parentElement).toBe(source);
    expect(harness.previewManager.applyOperation).not.toHaveBeenCalled();
    expect(harness.controllers.getJournal().entries).toHaveLength(0);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(0);

    dispatchPointer(document, "pointerup", { clientX: 240, clientY: 50, pointerId: 9 });

    const operations = harness.controllers.getRecordedOperations();
    expect(operations.some((operation) => operation.kind === "reparent-element")).toBe(true);
    expect(child.parentElement).toBe(target);
    expect(harness.controllers.getJournal().entries).toHaveLength(1);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(1);
    expect(synchronized).toHaveLength(1);
    expect(synchronized[0]?.kind).toBe("reparent-element");
    expect(sequence).toEqual(["apply", "sync", "record"]);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(child.parentElement).toBe(target);
    assertNoPositionElement(operations);
  });

  it("inserts before a cross-parent leaf at the held indicator", () => {
    const source = document.createElement("section");
    const target = document.createElement("section");
    target.style.cssText = "display:flex;flex-direction:column";
    const child = document.createElement("div");
    const first = document.createElement("div");
    const middle = document.createElement("div");
    const last = document.createElement("div");
    source.appendChild(child);
    target.append(first, middle, last);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 180 });
    setRect(child, { x: 10, y: 10, width: 60, height: 30 });
    setRect(target, { x: 200, y: 0, width: 160, height: 180 });
    setRect(first, { x: 210, y: 10, width: 140, height: 50 });
    setRect(middle, { x: 210, y: 70, width: 140, height: 50 });
    setRect(last, { x: 210, y: 130, width: 140, height: 40 });
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(child));

    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 20, pointerId: 24 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 80, pointerId: 24 });

    const indicator = visibleDropIndicator(harness.overlay.overlayContainer);
    expect(indicator.style).toMatchObject({
      left: "200px",
      top: "64px",
      width: "160px",
      height: "2px",
    });
    expect(indicator.getAttribute("data-orientation")).toBe("horizontal");
    expect([...target.children]).toEqual([first, middle, last]);

    dispatchPointer(document, "pointerup", { clientX: 240, clientY: 80, pointerId: 24 });

    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("reparent-element");
    if (operation?.kind === "reparent-element") expect(operation.targetIndex).toBe(1);
    expect([...target.children]).toEqual([first, child, middle, last]);
    expect(indicator.style.display).toBe("none");
  });

  it("allows a drop into a container nested inside the source parent", () => {
    const source = document.createElement("section");
    const child = document.createElement("div");
    const wrapper = document.createElement("div");
    const nestedTarget = document.createElement("section");
    nestedTarget.style.display = "grid";
    wrapper.appendChild(nestedTarget);
    source.append(child, wrapper);
    document.body.appendChild(source);
    setRect(source, { x: 0, y: 0, width: 360, height: 180 });
    setRect(child, { x: 10, y: 20, width: 70, height: 40 });
    setRect(wrapper, { x: 160, y: 10, width: 180, height: 140 });
    setRect(nestedTarget, { x: 180, y: 30, width: 120, height: 80 });
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(child));

    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 30, pointerId: 12 });
    dispatchPointer(document, "pointermove", { clientX: 220, clientY: 60, pointerId: 12 });
    dispatchPointer(document, "pointerup", { clientX: 220, clientY: 60, pointerId: 12 });

    expect(child.parentElement).toBe(nestedTarget);
    expect(harness.controllers.getRecordedOperations()[0]?.kind).toBe("reparent-element");
  });

  it("re-evaluates release coordinates instead of committing a stale target", () => {
    const source = document.createElement("section");
    const target = document.createElement("section");
    const child = document.createElement("div");
    source.appendChild(child);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 120 });
    setRect(target, { x: 200, y: 0, width: 160, height: 160 });
    setRect(child, { x: 10, y: 10, width: 60, height: 30 });
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(child));

    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 20, pointerId: 25 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 50, pointerId: 25 });
    expect(visibleDropIndicator(harness.overlay.overlayContainer).style.display).toBe("block");
    dispatchPointer(document, "pointerup", { clientX: 20, clientY: 20, pointerId: 25 });

    expect(child.parentElement).toBe(source);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(harness.controllers.getJournal().entries).toHaveLength(0);
  });

  it("reorders immediately after reparent without another selection update", () => {
    const source = document.createElement("section");
    const target = document.createElement("section");
    target.style.cssText = "display:flex;flex-direction:column";
    const child = document.createElement("div");
    const sibling = document.createElement("div");
    source.appendChild(child);
    target.appendChild(sibling);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 120 });
    setRect(target, { x: 200, y: 0, width: 160, height: 160 });
    setRect(child, { x: 210, y: 70, width: 60, height: 30 });
    setRect(sibling, { x: 210, y: 10, width: 60, height: 30 });
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(child));

    dispatchPointer(child, "pointerdown", { clientX: 220, clientY: 80, pointerId: 22 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 100, pointerId: 22 });
    dispatchPointer(document, "pointerup", { clientX: 240, clientY: 100, pointerId: 22 });
    expect([...target.children]).toEqual([sibling, child]);

    dispatchPointer(child, "pointerdown", { clientX: 220, clientY: 80, pointerId: 23 });
    dispatchPointer(document, "pointermove", { clientX: 220, clientY: 10, pointerId: 23 });
    dispatchPointer(document, "pointerup", { clientX: 220, clientY: 10, pointerId: 23 });

    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(2);
    const reorder = operations[1];
    expect(reorder?.kind).toBe("reorder-child");
    if (reorder?.kind !== "reorder-child") return;
    expect(reorder.fromIndex).toBe(1);
    expect(reorder.toIndex).toBe(0);
    expect([...target.children]).toEqual([child, sibling]);
  });

  it("rejects a nonzero-order flex target without preview or journal output", () => {
    const source = document.createElement("section");
    const target = document.createElement("section");
    target.style.cssText = "display:flex;flex-direction:row";
    const child = document.createElement("div");
    const first = document.createElement("div");
    const ordered = document.createElement("div");
    ordered.style.order = "1";
    source.appendChild(child);
    target.append(first, ordered);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 120 });
    setRect(child, { x: 10, y: 10, width: 60, height: 30 });
    setRect(target, { x: 200, y: 0, width: 180, height: 100 });
    setRect(first, { x: 210, y: 10, width: 60, height: 40 });
    setRect(ordered, { x: 290, y: 10, width: 60, height: 40 });
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(child));
    vi.spyOn(harness.previewManager, "applyOperation");

    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 20, pointerId: 35 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 30, pointerId: 35 });
    dispatchPointer(document, "pointerup", { clientX: 240, clientY: 30, pointerId: 35 });

    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(0);
    expect(harness.controllers.getJournal().entries).toHaveLength(0);
    expect(harness.previewManager.applyOperation).not.toHaveBeenCalled();
    expect(harness.diagnostics).toContainEqual(
      expect.objectContaining({ kind: "css-order-warning" }),
    );
    assertNoPositionElement(operations);
  });
});
