import { describe, expect, it, vi } from "vitest";

import {
  buildBreakpointScale,
  createBreakpointResolver,
  defaultBreakpointScale,
} from "./breakpoint-resolver.js";

/**
 * Build a window stub whose `matchMedia` reports `matches` for every min-width
 * strictly <= `viewportWidth`. This mirrors real mobile-first matchMedia: a
 * `(min-width: Npx)` query matches when the viewport is at least N px wide.
 */
function windowWithViewport(viewportWidth: number): {
  window: Window;
  setWidth: (w: number) => void;
} {
  let width = viewportWidth;
  const matchMedia = vi.fn((query: string): MediaQueryList => {
    const match = /^\(min-width:\s*(\d+)px\)$/.exec(query);
    const threshold =
      match === null ? Number.POSITIVE_INFINITY : Number.parseInt(match[1] ?? "0", 10);
    return {
      matches: width >= threshold,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList;
  });
  const win = { matchMedia } as unknown as Window;
  return {
    window: win,
    setWidth: (w) => {
      width = w;
    },
  };
}

describe("buildBreakpointScale", () => {
  it("returns the default Tailwind scale when no screens delivered", () => {
    const scale = buildBreakpointScale();
    expect(scale.map((e) => e.name)).toEqual(["sm", "md", "lg", "xl", "2xl"]);
    expect(scale.map((e) => e.minWidthPx)).toEqual([640, 768, 1024, 1280, 1536]);
  });

  it("drops delivered names not in the known min-width table (no guessing)", () => {
    const scale = buildBreakpointScale(["sm", "custom", "md", "tablet"]);
    expect(scale.map((e) => e.name)).toEqual(["sm", "md"]);
  });

  it("sorts delivered screens ascending by min-width regardless of input order", () => {
    const scale = buildBreakpointScale(["2xl", "sm", "lg"]);
    expect(scale.map((e) => e.minWidthPx)).toEqual([640, 1024, 1536]);
  });

  it("returns an empty scale when no delivered name is known (honest, no crash)", () => {
    const scale = buildBreakpointScale(["foo", "bar"]);
    expect(scale).toEqual([]);
  });
});

describe("createBreakpointResolver", () => {
  it("resolves the largest matching breakpoint (mobile-first cascade)", () => {
    const { window } = windowWithViewport(900);
    const resolver = createBreakpointResolver({ window });
    // 900px >= sm(640) and md(768), but < lg(1024) → md is the largest match.
    expect(resolver.resolve()).toBe("md");
  });

  it("resolves undefined below the smallest breakpoint (base styles apply)", () => {
    const { window } = windowWithViewport(500);
    const resolver = createBreakpointResolver({ window });
    expect(resolver.resolve()).toBeUndefined();
  });

  it("resolves the largest breakpoint at very wide viewports", () => {
    const { window } = windowWithViewport(2000);
    const resolver = createBreakpointResolver({ window });
    expect(resolver.resolve()).toBe("2xl");
  });

  it("updates the resolved breakpoint when the viewport resizes", () => {
    const { window, setWidth } = windowWithViewport(500);
    const resolver = createBreakpointResolver({ window });
    expect(resolver.resolve()).toBeUndefined();

    setWidth(800);
    expect(resolver.resolve()).toBe("md");

    setWidth(1600);
    expect(resolver.resolve()).toBe("2xl");
  });

  it("respects a delivered screens scale (subset of defaults)", () => {
    const { window } = windowWithViewport(1100);
    const resolver = createBreakpointResolver({ window, screens: ["sm", "md", "lg"] });
    expect(resolver.resolve()).toBe("lg");
    expect(resolver.getScale().map((e) => e.name)).toEqual(["sm", "md", "lg"]);
  });

  it("setScreens replaces the scale at runtime (daemon delivery)", () => {
    const { window } = windowWithViewport(1300);
    const resolver = createBreakpointResolver({ window });
    expect(resolver.resolve()).toBe("xl");

    resolver.setScreens(["sm", "md"]);
    // lg/xl/2xl no longer in the scale → md is now the largest match.
    expect(resolver.resolve()).toBe("md");
  });

  it("defaultBreakpointScale returns the full default scale", () => {
    expect(defaultBreakpointScale().map((e) => e.name)).toEqual(["sm", "md", "lg", "xl", "2xl"]);
  });
});
