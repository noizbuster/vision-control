import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  injectContentScriptIfNeeded,
  shouldInjectForUrl,
  TabInjectionRegistry,
} from "./content-injection.js";

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
  it("returns false for all pages because static content scripts cover http(s)", () => {
    expect(shouldInjectForUrl("http://subshell:10601/", ["subshell"])).toBe(false);
    expect(shouldInjectForUrl("http://localhost:3000/", ["subshell"])).toBe(false);
    expect(shouldInjectForUrl("https://app.example.com/", [])).toBe(false);
    expect(shouldInjectForUrl(undefined, ["subshell"])).toBe(false);
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

  it("never calls executeScript because static content scripts cover http(s)", () => {
    const registry = new TabInjectionRegistry();

    expect(
      injectContentScriptIfNeeded(42, "http://subshell:10601/", ["subshell"], registry),
    ).toBe(false);
    expect(injectContentScriptIfNeeded(1, "http://localhost:3000/", [], registry)).toBe(false);
    expect(injectContentScriptIfNeeded(1, "https://app.example.com/", [], registry)).toBe(false);
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("clears a stale registry entry when inject is skipped", () => {
    const registry = new TabInjectionRegistry();
    registry.markInjected(7);
    injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry);
    expect(registry.has(7)).toBe(false);
  });

  it("does NOT throw when chrome.scripting is unavailable", () => {
    clearChrome();
    const registry = new TabInjectionRegistry();
    expect(injectContentScriptIfNeeded(7, "http://subshell:10601/", ["subshell"], registry)).toBe(
      false,
    );
  });
});
