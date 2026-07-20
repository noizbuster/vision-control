import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBackgroundTabLifecycle,
  type TabLifecycleStore,
} from "./background-tab-lifecycle.js";
import type { FrameInfo } from "./messaging/index.js";

interface ScriptingMock {
  readonly executeScript: ReturnType<typeof vi.fn>;
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

function createScriptingMock(): ScriptingMock {
  return { executeScript: vi.fn().mockResolvedValue([]) };
}

interface StoreMock extends TabLifecycleStore {
  readonly resetForReload: ReturnType<typeof vi.fn<(tabId: number) => void>>;
  readonly ensure: ReturnType<typeof vi.fn<(tabId: number) => unknown>>;
  readonly updateFrameTree: ReturnType<
    typeof vi.fn<(tabId: number, frameTree: readonly FrameInfo[]) => void>
  >;
  readonly remove: ReturnType<typeof vi.fn<(tabId: number) => void>>;
}

function createFrameDiscoveryMock(): ReturnType<
  typeof vi.fn<(tabId: number) => Promise<readonly FrameInfo[]>>
> {
  return vi.fn<(tabId: number) => Promise<readonly FrameInfo[]>>().mockResolvedValue([]);
}

function createStore(): StoreMock {
  return {
    resetForReload: vi.fn<(tabId: number) => void>(),
    ensure: vi.fn<(tabId: number) => unknown>(),
    updateFrameTree: vi.fn<(tabId: number, frameTree: readonly FrameInfo[]) => void>(),
    remove: vi.fn<(tabId: number) => void>(),
  };
}

describe("createBackgroundTabLifecycle", () => {
  afterEach(() => {
    clearChrome();
    vi.restoreAllMocks();
  });

  it("tracks any http(s) tab without dynamic executeScript injection", () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    const discoverFrames = createFrameDiscoveryMock();
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => [],
      discoverFrames,
    });

    lifecycle.handleUpdated(42, { status: "complete" }, { url: "http://subshell:10601/" });

    expect(store.ensure).toHaveBeenCalledWith(42);
    expect(discoverFrames).toHaveBeenCalledWith(42);
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("does not dynamically inject loopback tabs", () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const lifecycle = createBackgroundTabLifecycle({
      store: createStore(),
      getGrantedHosts: () => [],
      discoverFrames: createFrameDiscoveryMock(),
    });

    lifecycle.handleUpdated(7, { status: "complete" }, { url: "http://localhost:5173/" });

    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("removes session state for non-http schemes", () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    const discoverFrames = createFrameDiscoveryMock();
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => [],
      discoverFrames,
    });

    lifecycle.handleUpdated(8, { status: "complete" }, { url: "chrome://extensions" });

    expect(store.remove).toHaveBeenCalledWith(8);
    expect(store.ensure).not.toHaveBeenCalled();
    expect(discoverFrames).not.toHaveBeenCalled();
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("does not dynamically inject already-loaded http tabs", async () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const lifecycle = createBackgroundTabLifecycle({
      store: createStore(),
      getGrantedHosts: () => [],
      discoverFrames: createFrameDiscoveryMock(),
      queryTabs: vi.fn().mockResolvedValue([
        { id: 1, url: "http://localhost:5173/" },
        { id: 2, url: "http://subshell:10601/" },
        { id: 3, url: "http://other-host:3000/" },
      ]),
    });

    await lifecycle.injectOpenTabs();

    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("keeps already-loaded http tabs after grant list is empty", async () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => [],
      discoverFrames: createFrameDiscoveryMock(),
      queryTabs: vi.fn().mockResolvedValue([{ id: 2, url: "http://subshell:10601/" }]),
    });

    await lifecycle.injectOpenTabs();

    expect(store.remove).not.toHaveBeenCalled();
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("still restores frame state when the grant list is empty", async () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    let resolveFrames: ((frames: readonly FrameInfo[]) => void) | undefined;
    const framesPromise = new Promise<readonly FrameInfo[]>((resolve) => {
      resolveFrames = resolve;
    });
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => [],
      discoverFrames: vi.fn(() => framesPromise),
    });

    lifecycle.handleUpdated(4, { status: "complete" }, { url: "http://subshell:10601/" });
    if (resolveFrames === undefined) {
      throw new Error("frame discovery promise was not requested");
    }
    resolveFrames([
      {
        frameId: 0,
        url: "http://subshell:10601/",
        origin: "http://subshell:10601",
        routeable: true,
      },
    ]);
    await framesPromise;
    await Promise.resolve();

    expect(store.remove).not.toHaveBeenCalled();
    expect(store.updateFrameTree).toHaveBeenCalledWith(4, [
      {
        frameId: 0,
        url: "http://subshell:10601/",
        origin: "http://subshell:10601",
        routeable: true,
      },
    ]);
  });

  it("clears injection state on reload and tab removal", () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => [],
      discoverFrames: createFrameDiscoveryMock(),
    });

    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    expect(scripting.executeScript).not.toHaveBeenCalled();

    lifecycle.handleUpdated(9, { status: "loading" }, { url: "http://subshell:10601/" });
    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    expect(scripting.executeScript).not.toHaveBeenCalled();

    lifecycle.handleRemoved(9);
    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    expect(scripting.executeScript).not.toHaveBeenCalled();
    expect(store.resetForReload).toHaveBeenCalledWith(9);
    expect(store.remove).toHaveBeenCalledWith(9);
  });
});
