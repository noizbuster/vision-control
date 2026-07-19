import type { Operation } from "@vision-control/change-ir";
import { attachOverlayRoot } from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
} from "@vision-control/preview-engine";
import { describe, expect, it, vi } from "vitest";

import { createReparentController } from "../components/interaction/index.js";
import { ReorderController } from "../components/interaction/ReorderController.js";
import { requireSelectionContext } from "./interaction-wiring.test-fixtures.js";
import { createReparentDragController } from "./reparent-drag-controller.js";

function setRect(element: Element, x: number, y: number, width: number, height: number): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(x, y, width, height));
}

function dispatchPointer(target: EventTarget, type: string, init: PointerEventInit): PointerEvent {
  const event = new PointerEvent(type, {
    ...init,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe("createReparentDragController", () => {
  it("prevents native selection immediately for an accepted descendant Move pointerdown", () => {
    document.body.innerHTML = "";
    const root = attachOverlayRoot(document);
    const overlayContainer = root.shadowRoot.querySelector<HTMLElement>(".vc-overlay-root");
    if (overlayContainer === null) {
      throw new Error("overlay container not found");
    }

    const source = document.createElement("section");
    const target = document.createElement("section");
    const unrelated = document.createElement("button");
    const card = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = "Card label";
    card.appendChild(label);
    source.appendChild(card);
    document.body.append(source, target, unrelated);
    setRect(source, 0, 0, 120, 120);
    setRect(card, 10, 10, 80, 40);
    setRect(label, 20, 20, 50, 20);
    setRect(target, 200, 0, 160, 160);

    const previewManager = createPreviewManager({ dom: createBrowserPreviewDomAdapter() });
    const operations: Operation[] = [];
    const reorder = new ReorderController({
      overlayContainer,
      previewManager,
      recordOperation: (operation) => operations.push(operation),
      onDiagnostic: () => {},
    });
    const reparent = createReparentController({
      callbacks: { onStateChange: () => {}, onHighlight: () => {} },
      previewEngine: previewManager,
      journal: { record: (operation) => operations.push(operation) },
    });
    const controller = createReparentDragController({
      document,
      reorder,
      reparent,
      getSelectionContext: () => requireSelectionContext(card),
    });

    try {
      controller.attach();
      const unrelatedPointerDown = dispatchPointer(unrelated, "pointerdown", {
        clientX: 30,
        clientY: 30,
        pointerId: 26,
      });
      expect(unrelatedPointerDown.defaultPrevented).toBe(false);

      const acceptedPointerDown = dispatchPointer(label, "pointerdown", {
        clientX: 30,
        clientY: 30,
        pointerId: 27,
      });
      expect(acceptedPointerDown.defaultPrevented).toBe(true);
      dispatchPointer(document, "pointermove", { clientX: 240, clientY: 50, pointerId: 27 });
      dispatchPointer(document, "pointerup", { clientX: 240, clientY: 50, pointerId: 27 });

      expect(operations).toHaveLength(1);
      expect(operations[0]?.kind).toBe("reparent-element");
      expect(card.parentElement).toBe(target);
      expect(label.parentElement).toBe(card);

      controller.detach();
      const detachedPointerDown = dispatchPointer(label, "pointerdown", {
        clientX: 30,
        clientY: 30,
        pointerId: 28,
      });
      expect(detachedPointerDown.defaultPrevented).toBe(false);
    } finally {
      controller.detach();
      reorder.detach();
      root.unmount();
      document.body.innerHTML = "";
      vi.restoreAllMocks();
    }
  });
});
