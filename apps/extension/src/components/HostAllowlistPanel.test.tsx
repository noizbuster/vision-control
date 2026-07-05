import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "../host-allowlist.js";
import { HostAllowlistPanel } from "./HostAllowlistPanel.js";

interface ChromeMock {
  permissions: {
    request: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  storage: {
    local: {
      store: Record<string, unknown>;
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
    onChanged: {
      addListener: (cb: (changes: Record<string, unknown>) => void) => void;
      removeListener: (cb: (changes: Record<string, unknown>) => void) => void;
    };
  };
}

function createChromeMock(
  initialHosts: readonly string[] = [],
  requestResult = true,
  removeResult = true,
): ChromeMock {
  const store: Record<string, unknown> = { [STORAGE_KEY]: [...initialHosts] };
  const changedListeners = new Set<(changes: Record<string, unknown>) => void>();
  const fireChange = (changes: Record<string, unknown>) => {
    for (const cb of changedListeners) {
      cb(changes);
    }
  };
  return {
    permissions: {
      request: vi.fn().mockResolvedValue(requestResult),
      remove: vi.fn().mockResolvedValue(removeResult),
    },
    storage: {
      local: {
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
          const changes: Record<string, unknown> = {};
          for (const [key, newValue] of Object.entries(items)) {
            changes[key] = { newValue: [...(newValue as string[])] };
          }
          Object.assign(store, items);
          fireChange(changes);
        }),
      },
      onChanged: {
        addListener: (cb: (changes: Record<string, unknown>) => void) => {
          changedListeners.add(cb);
        },
        removeListener: (cb: (changes: Record<string, unknown>) => void) => {
          changedListeners.delete(cb);
        },
      },
    },
  };
}

function installChrome(mock: ChromeMock): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: mock,
  });
}

describe("HostAllowlistPanel — render", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the input field and the host list", async () => {
    installChrome(createChromeMock(["subshell"]));
    render(<HostAllowlistPanel />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });
    expect(screen.getByPlaceholderText(/host/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /allow/i })).toBeDefined();
  });

  it("shows loopback defaults as always-on (not removable)", async () => {
    installChrome(createChromeMock([]));
    render(<HostAllowlistPanel />);

    await waitFor(() => {
      expect(screen.getByText("localhost")).toBeDefined();
      expect(screen.getByText("127.0.0.1")).toBeDefined();
      expect(screen.getByText("[::1]")).toBeDefined();
    });
    expect(screen.queryAllByRole("button", { name: /remove/i })).toHaveLength(0);
  });
});

describe("HostAllowlistPanel — Allow button", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("normalizes input and calls chrome.permissions.request with the right origins on Allow click", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    const input = screen.getByPlaceholderText(/host/i);
    fireEvent.change(input, { target: { value: "subshell:10601" } });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(mock.permissions.request).toHaveBeenCalledTimes(1);
    });
    const callArg = mock.permissions.request.mock.calls[0]?.[0] as { origins: string[] };
    expect(callArg.origins).toEqual(["http://subshell/*", "https://subshell/*"]);
  });

  it("persists the granted host to storage after a successful permission grant", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(mock.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell"] });
    });
  });

  it("does NOT call chrome.permissions.request when input is empty", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mock.permissions.request).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("does NOT call chrome.permissions.request for invalid input", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "*" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mock.permissions.request).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows an error when the user denies the permission prompt", async () => {
    const mock = createChromeMock([], false);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(mock.storage.local.set).not.toHaveBeenCalled();
  });

  it("shows an error when the host is already granted", async () => {
    const mock = createChromeMock(["subshell"]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mock.permissions.request).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("clears the input after a successful grant", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    const input = screen.getByPlaceholderText(/host/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "subshell" } });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });
});

describe("HostAllowlistPanel — Remove button", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("calls chrome.permissions.remove on Remove click", async () => {
    const mock = createChromeMock(["subshell"]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(mock.permissions.remove).toHaveBeenCalledTimes(1);
    });
    const callArg = mock.permissions.remove.mock.calls[0]?.[0] as { origins: string[] };
    expect(callArg.origins).toEqual(["http://subshell/*", "https://subshell/*"]);
  });

  it("removes the host from storage after a successful revoke", async () => {
    const mock = createChromeMock(["subshell"]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(mock.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: [] });
    });
  });

  it("reflects a newly granted host after a round-trip through storage", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    render(<HostAllowlistPanel />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(mock.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell"] });
    });

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });
  });
});
