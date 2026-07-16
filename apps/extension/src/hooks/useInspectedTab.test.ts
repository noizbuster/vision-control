import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInspectedTab } from "./useInspectedTab.js";

type EvalCallback = (result: unknown, exceptionInfo?: { isException?: boolean }) => void;
type NavigatedListener = (url: string) => void;
type TabUpdatedListener = (
  tabId: number,
  changeInfo: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab,
) => void;

interface ChromeStub {
  readonly devtools: {
    readonly inspectedWindow: {
      tabId: number;
      eval: ReturnType<typeof vi.fn>;
    };
    readonly network: {
      readonly onNavigated: {
        addListener: (listener: NavigatedListener) => void;
        removeListener: (listener: NavigatedListener) => void;
      };
    };
  };
  readonly runtime: { lastError: unknown };
  readonly tabs: {
    get: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    readonly onUpdated: {
      addListener: (listener: TabUpdatedListener) => void;
      removeListener: (listener: TabUpdatedListener) => void;
    };
  };
}

function installChromeStub(options: {
  readonly tabUrl?: string;
  readonly tabTitle?: string;
  readonly evalHref?: string | undefined;
  readonly evalThrows?: boolean;
}): {
  readonly chrome: ChromeStub;
  readonly navigatedListeners: NavigatedListener[];
  readonly tabUpdatedListeners: TabUpdatedListener[];
  readonly setEvalHref: (href: string | undefined) => void;
} {
  const navigatedListeners: NavigatedListener[] = [];
  const tabUpdatedListeners: TabUpdatedListener[] = [];
  let evalHref = options.evalHref;

  const chromeStub: ChromeStub = {
    devtools: {
      inspectedWindow: {
        tabId: 42,
        eval: vi.fn((expression: string, callback: EvalCallback) => {
          expect(expression).toBe("location.href");
          if (options.evalThrows) {
            throw new Error("eval unavailable");
          }
          callback(evalHref);
        }),
      },
      network: {
        onNavigated: {
          addListener: (listener) => {
            navigatedListeners.push(listener);
          },
          removeListener: (listener) => {
            const index = navigatedListeners.indexOf(listener);
            if (index >= 0) navigatedListeners.splice(index, 1);
          },
        },
      },
    },
    runtime: { lastError: undefined },
    tabs: {
      get: vi.fn((_tabId: number, callback: (tab: chrome.tabs.Tab) => void) => {
        callback({
          id: 42,
          title: options.tabTitle ?? "Page",
          url: options.tabUrl,
        } as chrome.tabs.Tab);
      }),
      query: vi.fn((_query: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => {
        callback([]);
      }),
      onUpdated: {
        addListener: (listener) => {
          tabUpdatedListeners.push(listener);
        },
        removeListener: (listener) => {
          const index = tabUpdatedListeners.indexOf(listener);
          if (index >= 0) tabUpdatedListeners.splice(index, 1);
        },
      },
    },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: chromeStub,
  });

  return {
    chrome: chromeStub,
    navigatedListeners,
    tabUpdatedListeners,
    setEvalHref: (href) => {
      evalHref = href;
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "chrome");
});

describe("useInspectedTab", () => {
  it("prefers the inspected document location over tabs.get about:blank", async () => {
    installChromeStub({
      tabUrl: "about:blank",
      tabTitle: "Subshell",
      evalHref: "http://subshell:10601/sign-in",
    });

    const { result } = renderHook(() => useInspectedTab());

    await waitFor(() => {
      expect(result.current.url).toBe("http://subshell:10601/sign-in");
    });
    expect(result.current.tabId).toBe(42);
    expect(result.current.title).toBe("Subshell");
  });

  it("updates the URL when the inspected page navigates", async () => {
    const stub = installChromeStub({
      tabUrl: "http://localhost:5173/",
      evalHref: "http://localhost:5173/",
    });

    const { result } = renderHook(() => useInspectedTab());

    await waitFor(() => {
      expect(result.current.url).toBe("http://localhost:5173/");
    });

    stub.navigatedListeners.forEach((listener) => {
      listener("http://localhost:5173/account");
    });

    await waitFor(() => {
      expect(result.current.url).toBe("http://localhost:5173/account");
    });
  });

  it("does not clobber a real URL with a later about:blank tabs.get result", async () => {
    const stub = installChromeStub({
      tabUrl: "about:blank",
      evalHref: "http://localhost:3000/app",
    });

    const { result } = renderHook(() => useInspectedTab());

    await waitFor(() => {
      expect(result.current.url).toBe("http://localhost:3000/app");
    });

    stub.tabUpdatedListeners.forEach((listener) => {
      listener(42, { url: "about:blank" }, {
        id: 42,
        url: "about:blank",
        title: "blank",
      } as chrome.tabs.Tab);
    });

    expect(result.current.url).toBe("http://localhost:3000/app");
  });

  it("falls back to tabs.get when DevTools eval is unavailable", async () => {
    installChromeStub({
      tabUrl: "http://localhost:5173/fallback",
      evalThrows: true,
    });

    const { result } = renderHook(() => useInspectedTab());

    await waitFor(() => {
      expect(result.current.url).toBe("http://localhost:5173/fallback");
    });
  });
});
