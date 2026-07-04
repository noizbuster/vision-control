import { beforeEach, describe, expect, it, vi } from "vitest";

import { DYNAMIC_SCRIPT_ID, STORAGE_KEY } from "./host-allowlist.js";
import {
  HostAllowlistCache,
  readGrantedHosts,
  syncDynamicContentScript,
  writeGrantedHosts,
} from "./host-allowlist-sync.js";

interface ScriptingMock {
  registerContentScripts: ReturnType<typeof vi.fn>;
  unregisterContentScripts: ReturnType<typeof vi.fn>;
  getRegisteredContentScripts: ReturnType<typeof vi.fn>;
}

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

function createScriptingMock(existingScripts: string[] = []): ScriptingMock {
  const registered = new Set(existingScripts);
  return {
    registerContentScripts: vi.fn(async (scripts: Array<{ id: string }>) => {
      for (const s of scripts) {
        if (registered.has(s.id)) {
          throw new Error(`Duplicate script ID: ${s.id}`);
        }
        registered.add(s.id);
      }
    }),
    unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => {
      for (const id of ids) {
        registered.delete(id);
      }
    }),
    getRegisteredContentScripts: vi.fn(async () => {
      return Array.from(registered);
    }),
  };
}

function installChrome(storage: StorageMock, scripting: ScriptingMock): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: {
      storage: { local: storage },
      scripting,
    },
  });
}

describe("readGrantedHosts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the stored host list", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["subshell", "my-server"] });
    installChrome(storage, createScriptingMock());

    const result = await readGrantedHosts();
    expect(result).toEqual(["subshell", "my-server"]);
  });

  it("returns an empty array when storage is empty", async () => {
    const storage = createStorageMock({});
    installChrome(storage, createScriptingMock());

    const result = await readGrantedHosts();
    expect(result).toEqual([]);
  });

  it("returns an empty array when the stored value is malformed", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: "not-an-array" });
    installChrome(storage, createScriptingMock());

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
    installChrome(storage, createScriptingMock());

    await writeGrantedHosts(["subshell", "other"]);
    expect(storage.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell", "other"] });
  });
});

describe("syncDynamicContentScript", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the dynamic CS with origin patterns for granted non-loopback hosts", async () => {
    const scripting = createScriptingMock();
    installChrome(createStorageMock(), scripting);

    await syncDynamicContentScript(["subshell", "my-server"]);

    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [DYNAMIC_SCRIPT_ID],
    });
    expect(scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const registered = scripting.registerContentScripts.mock.calls[0]?.[0] as Array<{
      id: string;
      matches: string[];
      js: string[];
      world: string;
    }>;
    expect(registered).toHaveLength(1);
    expect(registered[0]?.id).toBe(DYNAMIC_SCRIPT_ID);
    expect(registered[0]?.js).toEqual(["content-scripts/content.js"]);
    expect(registered[0]?.world).toBe("ISOLATED");
    expect(registered[0]?.matches).toContain("http://subshell/*");
    expect(registered[0]?.matches).toContain("https://subshell/*");
    expect(registered[0]?.matches).toContain("http://my-server/*");
    expect(registered[0]?.matches).toContain("https://my-server/*");
  });

  it("does NOT include loopback hosts in the dynamic registration (they are statically matched)", async () => {
    const scripting = createScriptingMock();
    installChrome(createStorageMock(), scripting);

    await syncDynamicContentScript(["localhost", "subshell"]);

    const registered = scripting.registerContentScripts.mock.calls[0]?.[0] as Array<{
      matches: string[];
    }>;
    const allMatches = registered[0]?.matches ?? [];
    expect(allMatches.some((m: string) => m.includes("localhost"))).toBe(false);
    expect(allMatches.some((m: string) => m.includes("subshell"))).toBe(true);
  });

  it("only unregisters (no re-registration) when the granted list is empty", async () => {
    const scripting = createScriptingMock([DYNAMIC_SCRIPT_ID]);
    installChrome(createStorageMock(), scripting);

    await syncDynamicContentScript([]);

    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [DYNAMIC_SCRIPT_ID],
    });
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it("deduplicates hosts (no duplicate match patterns)", async () => {
    const scripting = createScriptingMock();
    installChrome(createStorageMock(), scripting);

    await syncDynamicContentScript(["subshell", "subshell"]);

    const registered = scripting.registerContentScripts.mock.calls[0]?.[0] as Array<{
      matches: string[];
    }>;
    const matches = registered[0]?.matches ?? [];
    const httpCount = matches.filter((m: string) => m === "http://subshell/*").length;
    expect(httpCount).toBe(1);
  });

  it("fails the grant→inject test if registration is skipped (misleading_success guard)", async () => {
    const scripting = createScriptingMock();
    installChrome(createStorageMock(), scripting);

    await syncDynamicContentScript(["subshell"]);
    // If registerContentScripts was NOT called, the test fails — injection is
    // silently skipped, which is the misleading_success adversarial case.
    expect(scripting.registerContentScripts).toHaveBeenCalled();
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
    installChrome(storage, createScriptingMock());

    const cache = new HostAllowlistCache();
    await cache.initialize();
    expect(cache.getHosts()).toEqual(["stored-host"]);
  });

  it("initialize handles empty storage gracefully", async () => {
    const storage = createStorageMock({});
    installChrome(storage, createScriptingMock());

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

  it("addHost adds a host and persists + syncs", async () => {
    const storage = createStorageMock({});
    const scripting = createScriptingMock();
    installChrome(storage, scripting);

    const cache = new HostAllowlistCache();
    await cache.addHost("subshell");

    expect(cache.getHosts()).toContain("subshell");
    expect(storage.set).toHaveBeenCalled();
    expect(scripting.registerContentScripts).toHaveBeenCalled();
  });

  it("addHost ignores duplicates", async () => {
    const storage = createStorageMock({});
    installChrome(storage, createScriptingMock());

    const cache = new HostAllowlistCache();
    await cache.addHost("subshell");
    await cache.addHost("subshell");

    expect(cache.getHosts()).toEqual(["subshell"]);
  });

  it("removeHost drops a host and persists + syncs", async () => {
    const storage = createStorageMock({});
    const scripting = createScriptingMock([DYNAMIC_SCRIPT_ID]);
    installChrome(storage, scripting);

    const cache = new HostAllowlistCache();
    cache.setHosts(["subshell", "other"]);
    await cache.removeHost("subshell");

    expect(cache.getHosts()).toEqual(["other"]);
    expect(storage.set).toHaveBeenCalled();
  });

  it("removeHost on a non-existent host is a no-op", async () => {
    const storage = createStorageMock({});
    installChrome(storage, createScriptingMock());

    const cache = new HostAllowlistCache();
    await cache.removeHost("not-there");

    expect(cache.getHosts()).toEqual([]);
  });
});
