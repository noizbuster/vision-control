import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createParentOutline, type ParentOutline } from "./index.js";

describe("parent-outline", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a dotted outline at the parent rect inside the shadow root", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const outline: ParentOutline = createParentOutline(root);

    outline.setParentOutline({ x: 10, y: 12, width: 200, height: 80 });

    const el = overlay.shadowRoot.querySelector(".vc-parent-outline") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.display).toBe("block");
    expect(el.style.left).toBe("10px");
    expect(el.style.top).toBe("12px");
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("80px");

    outline.setParentOutline(null);
    expect(el.style.display).toBe("none");
    overlay.unmount();
  });

  it("does not render any markup in the page DOM (shadow-scoped)", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const outline = createParentOutline(root);

    outline.setParentOutline({ x: 0, y: 0, width: 50, height: 50 });

    expect(document.body.querySelector(".vc-parent-outline")).toBeNull();
    expect(document.body.querySelector(".vc-overlay-root")).toBeNull();
    overlay.unmount();
  });

  it("never captures pointer events (advisory only)", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const outline = createParentOutline(root);

    outline.setParentOutline({ x: 0, y: 0, width: 10, height: 10 });

    const el = overlay.shadowRoot.querySelector(".vc-parent-outline") as HTMLElement;
    expect(el.style.pointerEvents).toBe("none");
    overlay.unmount();
  });

  it("clear() hides the outline", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const outline = createParentOutline(root);

    outline.setParentOutline({ x: 0, y: 0, width: 10, height: 10 });
    outline.clear();

    const el = overlay.shadowRoot.querySelector(".vc-parent-outline") as HTMLElement;
    expect(el.style.display).toBe("none");
    overlay.unmount();
  });
});
