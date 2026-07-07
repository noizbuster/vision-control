import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createBoxModelOverlay } from "./index.js";

describe("box-model-overlay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders margin, border, and padding regions inside the shadow root", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const box = createBoxModelOverlay(root);

    box.setBoxModel({
      rect: { x: 100, y: 50, width: 120, height: 80 },
      margin: { top: 8, right: 8, bottom: 8, left: 8 },
      border: { top: 2, right: 2, bottom: 2, left: 2 },
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
    });

    const margin = overlay.shadowRoot.querySelector(".vc-box-model__region--margin") as HTMLElement;
    const border = overlay.shadowRoot.querySelector(".vc-box-model__region--border") as HTMLElement;
    const padding = overlay.shadowRoot.querySelector(
      ".vc-box-model__region--padding",
    ) as HTMLElement;

    expect(margin.style.display).toBe("block");
    expect(border.style.display).toBe("block");
    expect(padding.style.display).toBe("block");

    // Margin wraps the border box plus margin widths.
    expect(margin.style.left).toBe("92px");
    expect(margin.style.top).toBe("42px");
    expect(margin.style.width).toBe("136px");
    expect(margin.style.height).toBe("96px");
    expect(margin.style.borderTopWidth).toBe("8px");
    expect(margin.style.borderRightWidth).toBe("8px");
    expect(margin.style.borderBottomWidth).toBe("8px");
    expect(margin.style.borderLeftWidth).toBe("8px");

    // Border region equals the border box rect.
    expect(border.style.left).toBe("100px");
    expect(border.style.top).toBe("50px");
    expect(border.style.width).toBe("120px");
    expect(border.style.height).toBe("80px");
    expect(border.style.borderTopWidth).toBe("2px");

    // Padding region inset by border widths.
    expect(padding.style.left).toBe("102px");
    expect(padding.style.top).toBe("52px");
    expect(padding.style.width).toBe("116px");
    expect(padding.style.height).toBe("76px");
    expect(padding.style.borderTopWidth).toBe("10px");
    expect(padding.style.borderRightWidth).toBe("10px");
    expect(padding.style.borderBottomWidth).toBe("10px");
    expect(padding.style.borderLeftWidth).toBe("10px");

    box.setBoxModel(null);
    expect(margin.style.display).toBe("none");
    overlay.unmount();
  });

  it("does not leak markup into the page DOM", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const box = createBoxModelOverlay(root);

    box.setBoxModel({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const margin = overlay.shadowRoot.querySelector(".vc-box-model__region--margin") as HTMLElement;
    const padding = overlay.shadowRoot.querySelector(
      ".vc-box-model__region--padding",
    ) as HTMLElement;
    expect(margin.style.display).toBe("none");
    expect(padding.style.display).toBe("none");
    expect(document.body.querySelector(".vc-box-model")).toBeNull();
    overlay.unmount();
  });

  it("clear() hides all regions", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const box = createBoxModelOverlay(root);

    box.setBoxModel({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      margin: { top: 4, right: 4, bottom: 4, left: 4 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    box.clear();

    const layer = overlay.shadowRoot.querySelector(".vc-box-model") as HTMLElement;
    expect(layer.style.display).toBe("none");
    overlay.unmount();
  });
});
