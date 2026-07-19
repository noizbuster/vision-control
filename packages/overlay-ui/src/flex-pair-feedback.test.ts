import { afterEach, describe, expect, it, vi } from "vitest";

import { createFlexPairFeedback } from "./flex-pair-feedback.js";
import { attachOverlayRoot } from "./index.js";
import { createResizeHandles } from "./resize-handles.js";

describe("flex pair feedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("renders valid and active pair feedback exclusively in the overlay shadow root", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root");
    expect(root).toBeInstanceOf(HTMLElement);
    if (!(root instanceof HTMLElement)) return;
    const handles = createResizeHandles(root);
    const feedback = createFlexPairFeedback(root, handles);
    handles.showResizeHandles({ x: 10, y: 20, width: 80, height: 40 });

    feedback.set({
      kind: "valid",
      anchorRect: { x: 10, y: 20, width: 80, height: 40 },
      pairRect: { x: 90, y: 20, width: 80, height: 40 },
      label: "Paired neighbor ready",
      disabledHandles: ["w"],
    });

    const outline = overlay.shadowRoot.querySelector(".vc-flex-pair-outline");
    const label = overlay.shadowRoot.querySelector(".vc-flex-pair-label");
    const westHandle = handles.getHandleElement("w");
    expect(outline?.classList.contains("vc-flex-pair-outline--valid")).toBe(true);
    expect(label?.textContent).toBe("Paired neighbor ready");
    expect(westHandle).toBeInstanceOf(HTMLButtonElement);
    expect(westHandle).toHaveProperty("disabled", true);
    expect(document.querySelector(".vc-flex-pair-outline")).toBeNull();
    expect(document.querySelector(".vc-flex-pair-label")).toBeNull();

    feedback.set({
      kind: "active",
      anchorRect: { x: 10, y: 20, width: 80, height: 40 },
      pairRect: { x: 90, y: 20, width: 80, height: 40 },
      label: "Resizing paired neighbor",
      disabledHandles: ["w"],
    });

    expect(outline?.classList.contains("vc-flex-pair-outline--active")).toBe(true);
    expect(label?.textContent).toBe("Resizing paired neighbor");

    feedback.clear();
    expect(westHandle).toHaveProperty("disabled", false);
    overlay.unmount();
  });

  it("marks disabled-edge and blocked feedback with the native disabled handle state", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root");
    expect(root).toBeInstanceOf(HTMLElement);
    if (!(root instanceof HTMLElement)) return;
    const handles = createResizeHandles(root);
    const feedback = createFlexPairFeedback(root, handles);
    handles.showResizeHandles({ x: 10, y: 20, width: 80, height: 40 });

    feedback.set({
      kind: "disabled-edge",
      anchorRect: { x: 10, y: 20, width: 80, height: 40 },
      pairRect: null,
      label: "No neighbor at this edge",
      disabledHandles: ["e"],
    });

    const outline = overlay.shadowRoot.querySelector(".vc-flex-pair-outline");
    const label = overlay.shadowRoot.querySelector(".vc-flex-pair-label");
    const eastHandle = handles.getHandleElement("e");
    expect(outline?.classList.contains("vc-flex-pair-outline--disabled-edge")).toBe(true);
    expect(label?.classList.contains("vc-flex-pair-label--disabled-edge")).toBe(true);
    expect(label?.textContent).toBe("No neighbor at this edge");
    expect(eastHandle).toHaveProperty("disabled", true);

    feedback.set({
      kind: "blocked",
      anchorRect: { x: 10, y: 20, width: 80, height: 40 },
      pairRect: null,
      label: "Wrapped flex items cannot resize as a pair",
      disabledHandles: ["e"],
    });

    expect(outline?.classList.contains("vc-flex-pair-outline--blocked")).toBe(true);
    expect(label?.classList.contains("vc-flex-pair-label--blocked")).toBe(true);
    expect(label?.textContent).toBe("Wrapped flex items cannot resize as a pair");
    expect(eastHandle).toHaveProperty("disabled", true);
    overlay.unmount();
  });

  it("keeps short feedback labels inset from the right viewport edge", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root");
    expect(root).toBeInstanceOf(HTMLElement);
    if (!(root instanceof HTMLElement)) return;
    const handles = createResizeHandles(root);
    const feedback = createFlexPairFeedback(root, handles);
    const label = overlay.shadowRoot.querySelector(".vc-flex-pair-label");
    expect(label).toBeInstanceOf(HTMLElement);
    if (!(label instanceof HTMLElement)) return;
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(375);
    vi.spyOn(label, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 80, 20));

    feedback.set({
      kind: "disabled-edge",
      anchorRect: { x: 350, y: 20, width: 10, height: 10 },
      pairRect: null,
      label: "No pair",
      disabledHandles: [],
    });

    expect(label.style.left).toBe("291px");
    overlay.unmount();
  });
});
