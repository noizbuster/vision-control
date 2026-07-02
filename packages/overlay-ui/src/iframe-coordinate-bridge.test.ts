import { afterEach, describe, expect, it } from "vitest";

import { bridgeRectToTopFrame, OpaqueFrameError } from "./index.js";

describe("iframe coordinate bridge", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the original rect when the element is in the top frame", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const rect = new DOMRect(10, 20, 100, 50);
    const result = bridgeRectToTopFrame(rect, target);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    }
  });

  it("reports an opaque frame when the iframe is cross-origin", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const target = document.createElement("div");
    iframe.contentDocument?.body.appendChild(target);

    Object.defineProperty(iframe, "contentDocument", {
      value: null,
      configurable: true,
    });

    const rect = new DOMRect(5, 5, 10, 10);
    const result = bridgeRectToTopFrame(rect, target);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(OpaqueFrameError);
    }
  });
});
