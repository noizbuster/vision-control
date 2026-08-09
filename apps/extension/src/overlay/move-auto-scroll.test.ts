import { afterEach, describe, expect, it, vi } from "vitest";

import { createMoveAutoScroller } from "./move-auto-scroll.js";

const rect = (width: number, height: number): DOMRect => new DOMRect(0, 0, width, height);

describe("createMoveAutoScroller", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("scrolls the nearest eligible ancestor at a pointer edge and requests Move re-evaluation", () => {
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 600 });
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 200 });
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 200 });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(rect(200, 200));
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const onScrollFrame = vi.fn();
    const autoScroller = createMoveAutoScroller({
      document,
      getScrollableAncestors: () => [scroller],
      onScrollFrame,
    });

    autoScroller.update({
      point: { x: 199, y: 100 },
      scrollAnchor: scroller,
      windowFallback: false,
    });
    frame?.(0);

    expect(scroller.scrollLeft).toBeGreaterThan(0);
    expect(onScrollFrame).toHaveBeenCalledOnce();
    autoScroller.stop();
  });

  it("does not scroll away from an edge", () => {
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(rect(200, 200));
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const onScrollFrame = vi.fn();
    const autoScroller = createMoveAutoScroller({
      document,
      getScrollableAncestors: () => [scroller],
      onScrollFrame,
    });

    autoScroller.update({
      point: { x: 100, y: 100 },
      scrollAnchor: scroller,
      windowFallback: false,
    });
    frame?.(0);

    expect(scroller.scrollLeft).toBe(0);
    expect(scroller.scrollTop).toBe(0);
    expect(onScrollFrame).not.toHaveBeenCalled();
    autoScroller.stop();
  });
});
