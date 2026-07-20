import { describe, expect, it, vi } from "vitest";

import {
  createBackgroundTabLifecycle,
  type TabLifecycleStore,
} from "./background-tab-lifecycle.js";
import { refreshHostAccess } from "./host-access-refresh.js";
import { STORAGE_KEY } from "./host-allowlist.js";
import { HostAllowlistCache } from "./host-allowlist-sync.js";
import type { FrameInfo } from "./messaging/index.js";

interface StorageMock {
  readonly get: ReturnType<typeof vi.fn>;
  readonly set: ReturnType<typeof vi.fn>;
}

interface PermissionsMock {
  readonly getAll: ReturnType<typeof vi.fn>;
}

interface ScriptingMock {
  readonly executeScript: ReturnType<typeof vi.fn>;
}

interface StoreMock extends TabLifecycleStore {
  readonly resetForReload: ReturnType<typeof vi.fn<(tabId: number) => void>>;
  readonly ensure: ReturnType<typeof vi.fn<(tabId: number) => unknown>>;
  readonly updateFrameTree: ReturnType<
    typeof vi.fn<(tabId: number, frameTree: readonly FrameInfo[]) => void>
  >;
  readonly remove: ReturnType<typeof vi.fn<(tabId: number) => void>>;
}

function createStorageMock(initial: Record<string, unknown> = {}): StorageMock {
  const store = { ...initial };
  return {
    get: vi.fn(async (keys: string | readonly string[]) => {
      const keyArr: readonly string[] = typeof keys === "string" ? [keys] : keys;
      const result: Record<string, unknown> = {};
      for (const key of keyArr) {
        if (key in store) {
          result[key] = store[key];
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
  };
}

function createStore(): StoreMock {
  return {
    resetForReload: vi.fn<(tabId: number) => void>(),
    ensure: vi.fn<(tabId: number) => unknown>(),
    updateFrameTree: vi.fn<(tabId: number, frameTree: readonly FrameInfo[]) => void>(),
    remove: vi.fn<(tabId: number) => void>(),
  };
}

function installChrome(
  storage: StorageMock,
  permissions: PermissionsMock,
  scripting: ScriptingMock,
): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: {
      storage: { local: storage },
      permissions,
      scripting,
    },
  });
}

describe("refreshHostAccess", () => {
  it("imports native Chrome Site Access grants and refreshes open tabs", async () => {
    const storage = createStorageMock({});
    const permissions: PermissionsMock = {
      getAll: vi.fn(async () => ({ origins: ["http://localhost/*", "http://subshell/*"] })),
    };
    const scripting: ScriptingMock = { executeScript: vi.fn().mockResolvedValue([]) };
    installChrome(storage, permissions, scripting);
    const hostAllowlist = new HostAllowlistCache();
    const tabLifecycle = createBackgroundTabLifecycle({
      store: createStore(),
      getGrantedHosts: () => hostAllowlist.getHosts(),
      discoverFrames: vi.fn(async () => []),
      queryTabs: vi.fn(async () => [{ id: 7, url: "http://subshell:10601/" }]),
    });

    await refreshHostAccess({ hostAllowlist, injectOpenTabs: tabLifecycle.injectOpenTabs });

    expect(hostAllowlist.getHosts()).toEqual(["subshell"]);
    expect(storage.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell"] });
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });
});
