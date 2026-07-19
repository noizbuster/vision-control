import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInteractionHarness,
  dispatchPointer,
  type InteractionHarness,
  interactionOperationMessages,
  reparentDropIndicator,
  requireSelectionContext,
  setRect,
} from "./interaction-wiring.test-fixtures.js";

describe("interaction wiring lifecycle", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });
  afterEach(() => {
    harness.dispose();
  });

  const makeCrossParent = (): readonly [HTMLElement, HTMLElement, HTMLElement] => {
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
    return [source, target, child];
  };

  const highlight = (): HTMLElement | null =>
    harness.overlay.root.shadowRoot.querySelector<HTMLElement>(".vc-drop-target-highlight");

  it("clears a stale target and rejects release outside a candidate", () => {
    const [source, , child] = makeCrossParent();
    vi.spyOn(harness.previewManager, "applyOperation");

    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 20, pointerId: 17 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 50, pointerId: 17 });
    expect(highlight()?.style.display).toBe("block");
    const indicator = reparentDropIndicator(harness.overlay.overlayContainer);
    expect(indicator.style.display).toBe("block");

    dispatchPointer(document, "pointermove", { clientX: 20, clientY: 20, pointerId: 17 });
    expect(highlight()?.style.display).toBe("none");
    expect(indicator.style.display).toBe("none");
    dispatchPointer(document, "pointerup", { clientX: 20, clientY: 20, pointerId: 17 });

    expect(child.parentElement).toBe(source);
    expect(harness.previewManager.applyOperation).not.toHaveBeenCalled();
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(0);
  });

  it("cancels reparent and resumes reorder on the next drag", () => {
    const [source, , child] = makeCrossParent();
    source.style.cssText = "display:flex;flex-direction:row";
    const sibling = document.createElement("div");
    source.appendChild(sibling);
    setRect(source, { x: 0, y: 0, width: 180, height: 60 });
    setRect(child, { x: 0, y: 0, width: 60, height: 40 });
    setRect(sibling, { x: 70, y: 0, width: 60, height: 40 });
    vi.spyOn(harness.previewManager, "applyOperation");

    dispatchPointer(child, "pointerdown", { clientX: 10, clientY: 20, pointerId: 18 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 50, pointerId: 18 });
    dispatchPointer(document, "pointercancel", { clientX: 240, clientY: 50, pointerId: 18 });

    expect(highlight()?.style.display).toBe("none");
    expect(child.parentElement).toBe(source);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);

    dispatchPointer(child, "pointerdown", { clientX: 10, clientY: 20, pointerId: 19 });
    dispatchPointer(document, "pointermove", { clientX: 120, clientY: 20, pointerId: 19 });
    dispatchPointer(document, "pointerup", { clientX: 120, clientY: 20, pointerId: 19 });

    expect([...source.children]).toEqual([sibling, child]);
    expect(harness.controllers.getRecordedOperations()[0]?.kind).toBe("reorder-child");
  });

  it("clears held reparent feedback when move interactions detach", () => {
    const [source, , child] = makeCrossParent();
    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 20, pointerId: 20 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 50, pointerId: 20 });
    const indicator = reparentDropIndicator(harness.overlay.overlayContainer);
    expect(highlight()?.style.display).toBe("block");
    expect(indicator.style.display).toBe("block");

    harness.controllers.detachMove();

    expect(highlight()?.style.display).toBe("none");
    expect(indicator.style.display).toBe("none");
    expect(child.parentElement).toBe(source);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
  });

  it("clears held feedback and leaves the DOM unchanged on dispose", () => {
    const [source, , child] = makeCrossParent();
    dispatchPointer(child, "pointerdown", { clientX: 20, clientY: 20, pointerId: 26 });
    dispatchPointer(document, "pointermove", { clientX: 240, clientY: 50, pointerId: 26 });
    const indicator = reparentDropIndicator(harness.overlay.overlayContainer);
    expect(highlight()?.style.display).toBe("block");

    harness.controllers.dispose();

    expect(highlight()?.style.display).toBe("none");
    expect(indicator.style.display).toBe("none");
    expect(child.parentElement).toBe(source);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
  });

  it("repeated detach and dispose cleanup is idempotent", () => {
    makeCrossParent();
    harness.controllers.detach();
    harness.controllers.detach();
    harness.controllers.dispose();
    harness.controllers.dispose();
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
  });
});
