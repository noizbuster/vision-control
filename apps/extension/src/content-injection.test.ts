import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  injectContentScriptIfNeeded,
  shouldInjectForUrl,
  TabInjectionRegistry,
} from "./content-injection.js";
import { CONTENT_SCRIPT_PATH } from "./host-allowlist.js";

interface ScriptingMock {
  executeScript: ReturnType<typeof vi.fn>;
}

function createScriptingMock(): ScriptingMock {
  return {
    executeScript: vi.fn().mockResolvedValue([]),
  };
}

function installChrome(scripting: ScriptingMock): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: { scripting },
  });
}

function clearChrome(): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: undefined,
  });
}

describe("shouldInjectForUrl", () => {
  it("returns true for a granted non-loopback host URL", () => {
    expect(shouldInjectForUrl("http://subshell:10601/", ["subshell"])).toBe(true);
  });

  it("returns false for a loopback URL (covered by static CS)", () => {
    expect(shouldInjectForUrl("http://localhost:3000/", ["subshell"])).toBe(false);
    expect(shouldInjectForUrl("http://127.0.0.1:5173/", ["subshell"])).toBe(false);
    expect(shouldInjectForUrl("http://[::1]:8080/", ["subshell"])).toBe(false);
  });

  it("returns false for a loopback URL even when localhost is in the granted list", () => {
    // Loopback must never be double-injected: the static CS covers it.
    expect(shouldInjectForUrl("http://localhost:3000/", ["localhost"])).toBe(false);
  });

  it("returns false for a URL whose host is not granted", () => {
    expect(shouldInjectForUrl("http://other-host/", ["subshell"])).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(shouldInjectForUrl(undefined, ["subshell"])).toBe(false);
  });

  it("returns false for a non-http scheme", () => {
    expect(shouldInjectForUrl("chrome://extensions", ["subshell"])).toBe(false);
  });
});

describe("TabInjectionRegistry", () => {
  it("tracks injected tab IDs", () => {
    const registry = new TabInjectionRegistry();
    expect(registry.has(1)).toBe(false);
    registry.markInjected(1);
    expect(registry.has(1)).toBe(true);
  });

  it("clear removes a tab from the registry", () => {
    const registry = new TabInjectionRegistry();
    registry.markInjected(1);
    registry.clear(1);
    expect(registry.has(1)).toBe(false);
  });

  it("clearAll empties the registry", () => {
    const registry = new TabInjectionRegistry();
    registry.markInjected(1);
    registry.markInjected(2);
    registry.clearAll();
    expect(registry.has(1)).toBe(false);
    expect(registry.has(2)).toBe(false);
  });
});

describe("injectContentScriptIfNeeded", () => {
  let scripting: ScriptingMock;

  beforeEach(() => {
    scripting = createScriptingMock();
    installChrome(scripting);
  });

  afterEach(() => {
    clearChrome();
  });

  it("calls executeScript with the content script file + tabId for a granted non-loopback host", () => {
    const registry = new TabInjectionRegistry();

    const triggered = injectContentScriptIfNeeded(
      42,
      "http://subshell:10601/",
      ["subshell"],
      registry,
    );

    expect(triggered).toBe(true);
    expect(scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: [CONTENT_SCRIPT_PATH],
    });
  });

  it("does NOT call executeScript for a loopback host (static CS covers it)", () => {
    const registry = new TabInjectionRegistry();

    const triggered = injectContentScriptIfNeeded(
      1,
      "http://localhost:3000/",
      ["subshell"],
      registry,
    );

    expect(triggered).toBe(false);
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("does NOT call executeScript when the host is not granted", () => {
    const registry = new TabInjectionRegistry();

    const triggered = injectContentScriptIfNeeded(1, "http://other-host/", ["subshell"], registry);

    expect(triggered).toBe(false);
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("does NOT double-inject the same tab (misleading_success guard)", () => {
    const registry = new TabInjectionRegistry();

    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);
    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);

    // If executeScript was called twice, the overlay would be double-mounted.
    expect(scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it("re-injects after the tab is cleared (stale_state guard)", () => {
    const registry = new TabInjectionRegistry();

    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);
    expect(scripting.executeScript).toHaveBeenCalledTimes(1);

    // Simulate navigation: background clears the registry on loading status.
    registry.clear(7);

    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);
    expect(scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it("stops injecting once the host is revoked from the granted list (permission_revocation guard)", () => {
    const registry = new TabInjectionRegistry();

    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);
    expect(scripting.executeScript).toHaveBeenCalledTimes(1);

    // Host revoked — granted list is now empty.
    registry.clear(7);
    injectContentScriptIfNeeded(7, "http://subshell:10601/", [], registry);

    expect(scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it("clears the registry entry when navigating away from a granted host", () => {
    const registry = new TabInjectionRegistry();

    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);
    expect(registry.has(7)).toBe(true);

    // Tab navigates to a non-granted URL.
    injectContentScriptIfNeeded(7, "http://other-host/", ["subshell"], registry);
    expect(registry.has(7)).toBe(false);
  });

  it("does NOT throw and skips injection when chrome.scripting is unavailable", () => {
    clearChrome();
    const registry = new TabInjectionRegistry();

    const triggered = injectContentScriptIfNeeded(
      7,
      "http://subshell:10601/",
      ["subshell"],
      registry,
    );

    expect(triggered).toBe(false);
    expect(registry.has(7)).toBe(false);
  });

  it("logs to console.error and clears the registry when executeScript rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    scripting.executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));

    const registry = new TabInjectionRegistry();

    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);
    expect(registry.has(7)).toBe(true);

    // Wait for the microtask queue so the .catch handler runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalled();
    // Registry cleared so a future retry is possible.
    expect(registry.has(7)).toBe(false);
    errorSpy.mockRestore();
  });
});
