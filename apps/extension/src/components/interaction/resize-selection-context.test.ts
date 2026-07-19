import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureSelectionContext,
  type SelectionContext,
} from "../../overlay/interaction-selection-capture.js";
import { createSingleResizeTarget } from "./resize-selection-context.js";

const setRect = (element: Element, width: number, height: number): void => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, height));
};

const requireSelectionContext = (element: Element): SelectionContext => {
  const result = captureSelectionContext(element);
  if (!result.ok) throw new Error(`selection capture failed: ${result.diagnostic}`);
  return result.context;
};

describe("resize selection context", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
  });

  it("uses the live computed width instead of a hardcoded start", () => {
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:240px;height:80px";
    document.body.appendChild(target);
    setRect(target, 240, 80);

    const result = createSingleResizeTarget(requireSelectionContext(target).resize, "width");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.fromValue).toBe(240);
      expect(result.target.axis).toBe("x");
      expect(result.target.unit).toBe("px");
    }
  });

  it("uses the live cross-axis height for a cardinal single resize", () => {
    const target = document.createElement("div");
    target.style.cssText = "display:block;width:240px;height:80px";
    document.body.appendChild(target);
    setRect(target, 240, 80);

    const result = createSingleResizeTarget(requireSelectionContext(target).resize, "height");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.fromValue).toBe(80);
      expect(result.target.axis).toBe("y");
    }
  });

  it("uses the measured flex item main size when computed flex-basis is auto", () => {
    const parent = document.createElement("div");
    parent.style.cssText = "display:flex;flex-direction:row";
    const target = document.createElement("div");
    target.style.cssText = "display:block;flex-basis:auto;width:120px;height:60px";
    parent.appendChild(target);
    document.body.appendChild(parent);
    setRect(parent, 300, 80);
    setRect(target, 120, 60);

    const result = createSingleResizeTarget(requireSelectionContext(target).resize, "flex-basis");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.target.fromValue).toBe(120);
  });
});
