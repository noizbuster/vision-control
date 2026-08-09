import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPositionObserver, getScrollableAncestors } from "./index.js";

const mockObserver = (): object => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  unobserve: vi.fn(),
});

beforeEach(() => {
  // biome-ignore lint/complexity/useArrowFunction: must be constructible as a class
  globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
    return mockObserver();
  }) as unknown as typeof ResizeObserver;
  // biome-ignore lint/complexity/useArrowFunction: must be constructible as a class
  globalThis.IntersectionObserver = vi.fn().mockImplementation(function () {
    return mockObserver();
  }) as unknown as typeof IntersectionObserver;
});

describe("position observer", () => {
  it("creates ResizeObserver and IntersectionObserver for the target", () => {
    const onChange = vi.fn();
    const observer = createPositionObserver({ onChange });
    const target = document.createElement("div");
    document.body.appendChild(target);

    observer.observe(target);

    expect(globalThis.ResizeObserver).toHaveBeenCalled();
    expect(globalThis.IntersectionObserver).toHaveBeenCalled();
    observer.disconnect();
  });

  it("notifies on document capture scroll", () => {
    const onChange = vi.fn();
    const observer = createPositionObserver({ onChange });
    const target = document.createElement("div");
    document.body.appendChild(target);

    observer.observe(target);
    document.dispatchEvent(new Event("scroll"));

    expect(onChange).toHaveBeenCalledOnce();
    observer.disconnect();
  });
});

describe("getScrollableAncestors", () => {
  it("keeps parent-to-window order by default and includes a scrollable self on request", () => {
    const parent = document.createElement("div");
    const target = document.createElement("div");
    parent.style.overflow = "auto";
    target.style.overflow = "scroll";
    parent.appendChild(target);
    document.body.appendChild(parent);

    expect(getScrollableAncestors(target)).toEqual([parent, window]);
    expect(getScrollableAncestors(target, { includeSelf: true })).toEqual([target, parent, window]);
  });
});
