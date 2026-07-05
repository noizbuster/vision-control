import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBackgroundTabLifecycle,
  type TabLifecycleStore,
} from "./background-tab-lifecycle.js";
import { CONTENT_SCRIPT_PATH } from "./host-allowlist.js";
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

  it("injects the content script when a granted non-loopback tab completes loading", () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const lifecycle = createBackgroundTabLifecycle({
      store: createStore(),
      getGrantedHosts: () => ["subshell"],
      discoverFrames: createFrameDiscoveryMock(),
    });

    lifecycle.handleUpdated(42, { status: "complete" }, { url: "http://subshell:10601/" });

    expect(scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: [CONTENT_SCRIPT_PATH],
    });
  });

  it("does not dynamically inject loopback tabs", () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const lifecycle = createBackgroundTabLifecycle({
      store: createStore(),
      getGrantedHosts: () => ["subshell"],
      discoverFrames: createFrameDiscoveryMock(),
    });

    lifecycle.handleUpdated(7, { status: "complete" }, { url: "http://localhost:5173/" });

    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("removes stale session state when a completed tab URL is no longer allowed", () => {
    // Given: a tab that used to be tracked but whose host is no longer granted.
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    const discoverFrames = createFrameDiscoveryMock();
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => ["subshell"],
      discoverFrames,
    });

    // When: Chrome reports the tab complete on an unallowed non-loopback URL.
    lifecycle.handleUpdated(8, { status: "complete" }, { url: "http://other-host:3000/" });

    // Then: no session or route state is created for that tab.
    expect(store.remove).toHaveBeenCalledWith(8);
    expect(store.ensure).not.toHaveBeenCalled();
    expect(discoverFrames).not.toHaveBeenCalled();
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("injects already-loaded granted tabs after Site Access changes", async () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const lifecycle = createBackgroundTabLifecycle({
      store: createStore(),
      getGrantedHosts: () => ["subshell"],
      discoverFrames: createFrameDiscoveryMock(),
      queryTabs: vi.fn().mockResolvedValue([
        { id: 1, url: "http://localhost:5173/" },
        { id: 2, url: "http://subshell:10601/" },
        { id: 3, url: "http://other-host:3000/" },
      ]),
    });

    await lifecycle.injectOpenTabs();

    expect(scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 2 },
      files: [CONTENT_SCRIPT_PATH],
    });
  });

  it("prunes already-loaded tabs after Site Access revokes their host", async () => {
    // Given: Chrome still has an open non-loopback tab after its host was revoked.
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => [],
      discoverFrames: createFrameDiscoveryMock(),
      queryTabs: vi.fn().mockResolvedValue([{ id: 2, url: "http://subshell:10601/" }]),
    });

    // When: permission reconciliation scans already-loaded tabs.
    await lifecycle.injectOpenTabs();

    // Then: stale routing state is removed and no dynamic injection is attempted.
    expect(store.remove).toHaveBeenCalledWith(2);
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("does not restore frame state when Site Access is revoked before discovery resolves", async () => {
    // Given: a granted tab starts frame discovery, then loses its grant mid-flight.
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    let hosts: readonly string[] = ["subshell"];
    let resolveFrames: ((frames: readonly FrameInfo[]) => void) | undefined;
    const framesPromise = new Promise<readonly FrameInfo[]>((resolve) => {
      resolveFrames = resolve;
    });
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => hosts,
      discoverFrames: vi.fn(() => framesPromise),
    });

    // When: revocation happens before webNavigation frame discovery completes.
    lifecycle.handleUpdated(4, { status: "complete" }, { url: "http://subshell:10601/" });
    hosts = [];
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

    // Then: stale frame state is pruned instead of being reintroduced.
    expect(store.remove).toHaveBeenCalledWith(4);
    expect(store.updateFrameTree).not.toHaveBeenCalled();
  });

  it("clears injection state on reload and tab removal", () => {
    const scripting = createScriptingMock();
    installChrome(scripting);
    const store = createStore();
    const lifecycle = createBackgroundTabLifecycle({
      store,
      getGrantedHosts: () => ["subshell"],
      discoverFrames: createFrameDiscoveryMock(),
    });

    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    expect(scripting.executeScript).toHaveBeenCalledTimes(1);

    lifecycle.handleUpdated(9, { status: "loading" }, { url: "http://subshell:10601/" });
    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    expect(scripting.executeScript).toHaveBeenCalledTimes(2);

    lifecycle.handleRemoved(9);
    lifecycle.handleUpdated(9, { status: "complete" }, { url: "http://subshell:10601/" });
    expect(scripting.executeScript).toHaveBeenCalledTimes(3);
    expect(store.resetForReload).toHaveBeenCalledWith(9);
    expect(store.remove).toHaveBeenCalledWith(9);
  });
});
