import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App.js";

function setupChromeStubs(theme: "dark" | "light") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && theme === "dark",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });

  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    value: {
      devtools: {
        inspectedWindow: { tabId: 42 },
      },
      runtime: {
        lastError: undefined,
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => {}, removeListener: () => {} },
        connect: () => ({
          onMessage: { addListener: () => {}, removeListener: () => {} },
          onDisconnect: { addListener: () => {}, removeListener: () => {} },
          disconnect: () => {},
          postMessage: () => {},
        }),
      },
      tabs: {
        get: (_tabId: number, callback: (tab: { title?: string; url?: string }) => void) => {
          callback({ title: "Test page", url: "http://localhost:3000/" });
        },
      },
    },
  });
}

describe("App", () => {
  beforeEach(() => {
    setupChromeStubs("light");
  });

  it("renders without crashing and shows the inspected tab URL", () => {
    render(<App />);
    expect(screen.getByText("Vision Control")).toBeDefined();
    expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/");
  });

  it("reflects the dark theme class when the system prefers dark", () => {
    setupChromeStubs("dark");
    render(<App />);
    expect(document.querySelector(".app--dark")).not.toBeNull();
  });
});
