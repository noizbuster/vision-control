import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveTheme, useTheme } from "./useTheme.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubMatchMedia(dark: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && dark,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}

function stubChromeTheme(themeName: string | undefined): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value:
      themeName === undefined
        ? undefined
        : {
            devtools: {
              panels: {
                themeName,
              },
            },
          },
  });
}

describe("resolveTheme", () => {
  it("maps DevTools themeName dark to dark", () => {
    stubMatchMedia(false);
    stubChromeTheme("dark");
    expect(resolveTheme()).toBe("dark");
  });

  it("maps DevTools themeName default to light", () => {
    stubMatchMedia(true);
    stubChromeTheme("default");
    expect(resolveTheme()).toBe("light");
  });

  it("falls back to prefers-color-scheme when themeName is absent", () => {
    stubMatchMedia(true);
    stubChromeTheme(undefined);
    expect(resolveTheme()).toBe("dark");

    stubMatchMedia(false);
    expect(resolveTheme()).toBe("light");
  });
});

describe("useTheme", () => {
  it("exposes the resolved theme", () => {
    stubMatchMedia(false);
    stubChromeTheme("dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });
});
