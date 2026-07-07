import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPositionObserver } from "./index.js";

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
