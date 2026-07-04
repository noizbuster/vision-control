import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "../host-allowlist.js";
import { useGrantedHosts } from "./useGrantedHosts.js";

interface StorageMock {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  onChangedListeners: Set<(changes: Record<string, unknown>) => void>;
  fireChange: (changes: Record<string, unknown>) => void;
}

function createStorageMock(initial: Record<string, unknown> = {}): StorageMock {
  const store = { ...initial };
  const onChangedListeners = new Set<(changes: Record<string, unknown>) => void>();
  return {
    store,
    onChangedListeners,
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
    fireChange: (changes) => {
      for (const listener of onChangedListeners) {
        listener(changes);
      }
    },
  };
}

function installChrome(storage: StorageMock): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: {
      storage: {
        local: {
          get: storage.get,
          set: storage.set,
        },
        onChanged: {
          addListener: (cb: (changes: Record<string, unknown>) => void) => {
            storage.onChangedListeners.add(cb);
          },
          removeListener: (cb: (changes: Record<string, unknown>) => void) => {
            storage.onChangedListeners.delete(cb);
          },
        },
      },
    },
  });
}

describe("useGrantedHosts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads hosts from storage on mount", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["subshell", "other"] });
    installChrome(storage);

    const { result } = renderHook(() => useGrantedHosts());

    await waitFor(() => {
      expect(result.current.hosts).toEqual(["subshell", "other"]);
    });
  });

  it("starts with an empty list when storage is empty", async () => {
    const storage = createStorageMock({});
    installChrome(storage);

    const { result } = renderHook(() => useGrantedHosts());

    await waitFor(() => {
      expect(result.current.hosts).toEqual([]);
    });
  });

  it("updates when storage.onChanged fires for the granted-hosts key", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["subshell"] });
    installChrome(storage);

    const { result } = renderHook(() => useGrantedHosts());

    await waitFor(() => {
      expect(result.current.hosts).toEqual(["subshell"]);
    });

    act(() => {
      storage.fireChange({
        [STORAGE_KEY]: { newValue: ["subshell", "added-host"] },
      });
    });

    await waitFor(() => {
      expect(result.current.hosts).toEqual(["subshell", "added-host"]);
    });
  });

  it("ignores storage.onChanged for unrelated keys", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["subshell"] });
    installChrome(storage);

    const { result } = renderHook(() => useGrantedHosts());

    await waitFor(() => {
      expect(result.current.hosts).toEqual(["subshell"]);
    });

    act(() => {
      storage.fireChange({
        unrelatedKey: { newValue: "whatever" },
      });
    });

    expect(result.current.hosts).toEqual(["subshell"]);
  });

  it("handles removal (newValue undefined) by clearing the list", async () => {
    const storage = createStorageMock({ [STORAGE_KEY]: ["subshell"] });
    installChrome(storage);

    const { result } = renderHook(() => useGrantedHosts());

    await waitFor(() => {
      expect(result.current.hosts).toEqual(["subshell"]);
    });

    act(() => {
      storage.fireChange({
        [STORAGE_KEY]: { oldValue: ["subshell"] },
      });
    });

    await waitFor(() => {
      expect(result.current.hosts).toEqual([]);
    });
  });
});
