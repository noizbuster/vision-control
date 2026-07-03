import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, createRotationHandle } from "./index.js";

describe("rotation-handle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is present in the shadow root but disabled (PRD §8.2)", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const handle = createRotationHandle(root);

    handle.show({ x: 100, y: 50, width: 120, height: 80 });

    const el = overlay.shadowRoot.querySelector(".vc-rotation-handle") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.display).toBe("block");
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.getAttribute("data-disabled")).toBe("");
    expect(el.style.pointerEvents).toBe("none");
    overlay.unmount();
  });

  it("is not focusable (tabindex -1)", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const handle = createRotationHandle(root);

    handle.show({ x: 0, y: 0, width: 50, height: 50 });

    const el = overlay.shadowRoot.querySelector(".vc-rotation-handle") as HTMLElement;
    expect(el.getAttribute("tabindex")).toBe("-1");
    overlay.unmount();
  });

  it("positions the handle above the selection rect with a connecting stem", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const handle = createRotationHandle(root);

    handle.show({ x: 200, y: 100, width: 100, height: 60 });

    const stem = overlay.shadowRoot.querySelector(".vc-rotation-handle__stem") as HTMLElement;
    const knob = overlay.shadowRoot.querySelector(".vc-rotation-handle") as HTMLElement;
    expect(stem.style.display).toBe("block");
    expect(knob.style.display).toBe("block");
    // Stem sits at the horizontal center of the rect.
    expect(stem.style.left).toBe("249.5px");
    overlay.unmount();
  });

  it("does not leak markup into the page DOM", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const handle = createRotationHandle(root);

    handle.show({ x: 0, y: 0, width: 10, height: 10 });

    expect(document.body.querySelector(".vc-rotation-handle")).toBeNull();
    overlay.unmount();
  });

  it("clear() hides both the handle and the stem", () => {
    const overlay = attachOverlayRoot();
    const root = overlay.shadowRoot.querySelector(".vc-overlay-root") as HTMLElement;
    const handle = createRotationHandle(root);

    handle.show({ x: 0, y: 0, width: 10, height: 10 });
    handle.clear();

    const knob = overlay.shadowRoot.querySelector(".vc-rotation-handle") as HTMLElement;
    const stem = overlay.shadowRoot.querySelector(".vc-rotation-handle__stem") as HTMLElement;
    expect(knob.style.display).toBe("none");
    expect(stem.style.display).toBe("none");
    overlay.unmount();
  });
});
