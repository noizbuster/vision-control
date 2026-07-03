import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createOverlayElement } from "./index.js";

describe("overlay element rendering", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("renders a hover outline at the given rect", () => {
    const overlay = attachOverlayRoot();
    const element = createOverlayElement(overlay.shadowRoot);

    element.setHover({ x: 10, y: 20, width: 100, height: 50 });

    const hoverOutline = overlay.shadowRoot.querySelector(".vc-hover-outline") as HTMLElement;
    expect(hoverOutline.style.display).toBe("block");
    expect(hoverOutline.style.left).toBe("10px");
    expect(hoverOutline.style.top).toBe("20px");
    expect(hoverOutline.style.width).toBe("100px");
    expect(hoverOutline.style.height).toBe("50px");

    element.setHover(null);
    expect(hoverOutline.style.display).toBe("none");
    overlay.unmount();
  });

  it("renders a selection outline, label, and confidence badge", () => {
    const overlay = attachOverlayRoot();
    const element = createOverlayElement(overlay.shadowRoot);

    element.setSelection({
      rect: { x: 5, y: 15, width: 80, height: 40 },
      label: "button.primary",
      confidence: "high",
    });

    const selectOutline = overlay.shadowRoot.querySelector(".vc-select-outline") as HTMLElement;
    const label = overlay.shadowRoot.querySelector(".vc-label") as HTMLElement;
    const badge = label.querySelector(".vc-badge") as HTMLElement;

    expect(selectOutline.style.display).toBe("block");
    expect(label.style.display).toBe("inline-flex");
    expect(label.textContent).toContain("button.primary");
    expect(badge.classList.contains("vc-badge-high")).toBe(true);
    expect(badge.textContent).toBe("high");

    overlay.unmount();
  });

  it("clears all artifacts when clear() is called", () => {
    const overlay = attachOverlayRoot();
    const element = createOverlayElement(overlay.shadowRoot);

    element.setHover({ x: 0, y: 0, width: 10, height: 10 });
    element.setSelection({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      label: "x",
      confidence: "low",
    });
    element.clear();

    expect(
      (overlay.shadowRoot.querySelector(".vc-hover-outline") as HTMLElement).style.display,
    ).toBe("none");
    expect((overlay.shadowRoot.querySelector(".vc-label") as HTMLElement).style.display).toBe(
      "none",
    );
    overlay.unmount();
  });

  it("drives the parent, box-model, axis, rotation, changed-badge, and ghost artifacts through the facade", () => {
    const overlay = attachOverlayRoot();
    const element = createOverlayElement(overlay.shadowRoot);

    element.setParentOutline({ x: 1, y: 2, width: 3, height: 4 });
    element.setBoxModel({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      margin: { top: 1, right: 1, bottom: 1, left: 1 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    element.setFlexGridAxis({
      rect: { x: 0, y: 0, width: 100, height: 50 },
      kind: "flex",
      direction: "horizontal",
    });
    element.setRotationHandle({ x: 10, y: 10, width: 40, height: 40 });
    element.setChangedBadge({ rect: { x: 0, y: 0, width: 20, height: 20 }, label: "changed" });
    element.setDragGhost({ rect: { x: 5, y: 5, width: 30, height: 30 }, kind: "ghost" });

    expect(
      (overlay.shadowRoot.querySelector(".vc-parent-outline") as HTMLElement).style.display,
    ).toBe("block");
    expect(
      (overlay.shadowRoot.querySelector(".vc-box-model__region--margin") as HTMLElement).style
        .display,
    ).toBe("block");
    expect(
      (overlay.shadowRoot.querySelector(".vc-axis-indicator") as HTMLElement).style.display,
    ).toBe("block");
    expect(
      (overlay.shadowRoot.querySelector(".vc-rotation-handle") as HTMLElement).style.display,
    ).toBe("block");
    expect(
      (overlay.shadowRoot.querySelector(".vc-changed-badge") as HTMLElement).style.display,
    ).toBe("inline-flex");
    expect((overlay.shadowRoot.querySelector(".vc-drag-ghost") as HTMLElement).style.display).toBe(
      "block",
    );

    element.clear();

    expect(
      (overlay.shadowRoot.querySelector(".vc-parent-outline") as HTMLElement).style.display,
    ).toBe("none");
    expect(
      (overlay.shadowRoot.querySelector(".vc-rotation-handle") as HTMLElement).style.display,
    ).toBe("none");
    expect((overlay.shadowRoot.querySelector(".vc-drag-ghost") as HTMLElement).style.display).toBe(
      "none",
    );
    overlay.unmount();
  });

  it("exposes the rotation handle as always disabled (PRD §8.2)", () => {
    const overlay = attachOverlayRoot();
    const element = createOverlayElement(overlay.shadowRoot);

    element.setRotationHandle({ x: 0, y: 0, width: 50, height: 50 });

    const handle = overlay.shadowRoot.querySelector(".vc-rotation-handle") as HTMLElement;
    expect(handle.getAttribute("aria-disabled")).toBe("true");
    expect(handle.getAttribute("data-disabled")).toBe("");
    expect(handle.style.pointerEvents).toBe("none");
    expect(handle.getAttribute("tabindex")).toBe("-1");
    overlay.unmount();
  });

  it("renders all 14 PRD §8.2 artifacts inside the shadow root, none in the page DOM", () => {
    const overlay = attachOverlayRoot();
    const element = createOverlayElement(overlay.shadowRoot);

    element.setHover({ x: 0, y: 0, width: 10, height: 10 });
    element.setSelection({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      label: "x",
      confidence: "high",
    });
    element.setParentOutline({ x: 0, y: 0, width: 10, height: 10 });
    element.setBoxModel({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      margin: { top: 1, right: 1, bottom: 1, left: 1 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    element.setFlexGridAxis({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      kind: "flex",
      direction: "horizontal",
    });
    element.setResizeHandles({ x: 0, y: 0, width: 10, height: 10 });
    element.setRotationHandle({ x: 0, y: 0, width: 10, height: 10 });
    element.setChangedBadge({ rect: { x: 0, y: 0, width: 10, height: 10 }, label: "c" });
    element.setDragGhost({ rect: { x: 0, y: 0, width: 10, height: 10 }, kind: "ghost" });

    const shadowClasses = [
      ".vc-hover-outline",
      ".vc-select-outline",
      ".vc-parent-outline",
      ".vc-box-model__region--margin",
      ".vc-axis-indicator",
      ".vc-handle",
      ".vc-rotation-handle",
      ".vc-changed-badge",
      ".vc-drag-ghost",
      ".vc-label",
      ".vc-badge",
    ];
    for (const cls of shadowClasses) {
      expect(
        overlay.shadowRoot.querySelector(cls),
        `${cls} should be in shadow root`,
      ).not.toBeNull();
      expect(document.body.querySelector(cls), `${cls} must not leak to page DOM`).toBeNull();
    }
    overlay.unmount();
  });
});
