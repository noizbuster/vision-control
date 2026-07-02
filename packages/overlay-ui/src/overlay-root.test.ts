import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, isOverlayElement, type OverlayRoot } from "./index.js";

describe("overlay root", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("attaches an open shadow root and appends the host to the document element", () => {
    const overlay = attachOverlayRoot();
    expect(overlay.host.isConnected).toBe(true);
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.shadowRoot).toBe(overlay.host.shadowRoot);
    expect(overlay.shadowRoot.mode).toBe("open");
    overlay.unmount();
  });

  it("injects scoped overlay styles into the shadow root", () => {
    const overlay = attachOverlayRoot();
    const style = overlay.shadowRoot.querySelector("style");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("vc-overlay-root");
    overlay.unmount();
  });

  it("unmount removes the host from the DOM", () => {
    const overlay = attachOverlayRoot();
    overlay.unmount();
    expect(overlay.host.isConnected).toBe(false);
  });
});

describe("isOverlayElement", () => {
  let overlay: OverlayRoot;

  beforeEach(() => {
    overlay = attachOverlayRoot();
  });

  afterEach(() => {
    overlay.unmount();
  });

  it("returns true for the host element", () => {
    expect(isOverlayElement(overlay.host, overlay.host)).toBe(true);
  });

  it("returns true for a child of the shadow root", () => {
    const inner = document.createElement("div");
    overlay.shadowRoot.appendChild(inner);
    expect(isOverlayElement(inner, overlay.host)).toBe(true);
  });

  it("returns false for a page element", () => {
    const pageEl = document.createElement("div");
    document.body.appendChild(pageEl);
    expect(isOverlayElement(pageEl, overlay.host)).toBe(false);
  });
});
