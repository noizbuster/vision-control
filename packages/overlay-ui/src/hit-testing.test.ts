import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, hitTest } from "./index.js";

describe("hit testing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("returns the first non-overlay element from elementsFromPoint", () => {
    const overlay = attachOverlayRoot();
    const target = document.createElement("button");
    document.body.appendChild(target);

    const overlayChild = document.createElement("div");
    overlay.shadowRoot.appendChild(overlayChild);

    const elements = [overlay.host, overlayChild, target];
    document.elementsFromPoint = () => elements as Element[];

    const result = hitTest({ x: 50, y: 50 }, overlay.host);
    expect(result).toBe(target);
    overlay.unmount();
  });

  it("returns null when every element is overlay content", () => {
    const overlay = attachOverlayRoot();
    const overlayChild = document.createElement("div");
    overlay.shadowRoot.appendChild(overlayChild);

    document.elementsFromPoint = () => [overlay.host, overlayChild];

    expect(hitTest({ x: 0, y: 0 }, overlay.host)).toBeNull();
    overlay.unmount();
  });
});
