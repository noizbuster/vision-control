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
});
