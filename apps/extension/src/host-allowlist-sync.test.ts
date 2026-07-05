import { beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "./host-allowlist.js";
import { HostAllowlistCache, readGrantedHosts, writeGrantedHosts } from "./host-allowlist-sync.js";

interface StorageMock {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function createStorageMock(initial: Record<string, unknown> = {}): StorageMock & {
  store: Record<string, unknown>;
} {
  const store = { ...initial };
  return {
    store,
    get: vi.fn(async (keys: string | string[]) => {
      const keyArr = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const k of keyArr) {
        if (k in store) {
          result[k] = store[k];
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
  };
}

function installChrome(storage: StorageMock): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: {
      storage: { local: storage },
    },
  });
}

describe("readGrantedHosts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the stored host list", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["subshell", "my-server"] });
    installChrome(storage);

    const result = await readGrantedHosts();
    expect(result).toEqual(["subshell", "my-server"]);
  });

  it("returns an empty array when storage is empty", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    const result = await readGrantedHosts();
    expect(result).toEqual([]);
  });

  it("returns an empty array when the stored value is malformed", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: "not-an-array" });
    installChrome(storage);

    const result = await readGrantedHosts();
    expect(result).toEqual([]);
  });
});

describe("writeGrantedHosts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("persists the host list to chrome.storage.local", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    await writeGrantedHosts(["subshell", "other"]);
    expect(storage.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell", "other"] });
  });
});

describe("HostAllowlistCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts empty", () => {
    const cache = new HostAllowlistCache();
    expect(cache.getHosts()).toEqual([]);
  });

  it("setHosts updates the in-memory list", () => {
    const cache = new HostAllowlistCache();
    cache.setHosts(["subshell"]);
    expect(cache.getHosts()).toEqual(["subshell"]);
  });

  it("initialize reads from storage and populates the cache", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["stored-host"] });
    installChrome(storage);

    const cache = new HostAllowlistCache();
    await cache.initialize();
    expect(cache.getHosts()).toEqual(["stored-host"]);
  });

  it("initialize handles empty storage gracefully", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    const cache = new HostAllowlistCache();
    await cache.initialize();
    expect(cache.getHosts()).toEqual([]);
  });

  it("isAllowedUrl delegates to the unified predicate with the cached hosts", () => {
    const cache = new HostAllowlistCache();
    cache.setHosts(["subshell"]);

    expect(cache.isAllowedUrl("http://subshell:10601/")).toBe(true);
    expect(cache.isAllowedUrl("http://localhost:3000/")).toBe(true);
    expect(cache.isAllowedUrl("http://unrelated-host/")).toBe(false);
  });

  it("addHost adds a host and persists to storage", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    const cache = new HostAllowlistCache();
    await cache.addHost("subshell");

    expect(cache.getHosts()).toContain("subshell");
    expect(storage.set).toHaveBeenCalled();
  });

  it("addHost ignores duplicates", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    const cache = new HostAllowlistCache();
    await cache.addHost("subshell");
    await cache.addHost("subshell");

    expect(cache.getHosts()).toEqual(["subshell"]);
  });

  it("removeHost drops a host and persists to storage", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    const cache = new HostAllowlistCache();
    cache.setHosts(["subshell", "other"]);
    await cache.removeHost("subshell");

    expect(cache.getHosts()).toEqual(["other"]);
    expect(storage.set).toHaveBeenCalled();
  });

  it("removeHost on a non-existent host is a no-op", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    const cache = new HostAllowlistCache();
    await cache.removeHost("not-there");

    expect(cache.getHosts()).toEqual([]);
  });

  it("sync re-reads the granted host list from storage", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["new-host"] });
    installChrome(storage);

    const cache = new HostAllowlistCache();
    await cache.sync();
    expect(cache.getHosts()).toEqual(["new-host"]);
  });
});
