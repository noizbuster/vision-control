import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "../host-allowlist.js";
import type { MessageBus } from "../messaging/index.js";
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

function createChromeMock(initialHosts: readonly string[] = [], removeResult = true): ChromeMock {
  const store: Record<string, unknown> = { [STORAGE_KEY]: [...initialHosts] };
  const changedListeners = new Set<(changes: Record<string, unknown>) => void>();
  const fireChange = (changes: Record<string, unknown>) => {
    for (const cb of changedListeners) {
      cb(changes);
    }
  };
  return {
    permissions: {
      request: vi.fn().mockResolvedValue(true),
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

function createMockBus(): MessageBus & { send: ReturnType<typeof vi.fn> } {
  return {
    getRoute: vi.fn().mockReturnValue("panel"),
    send: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
    dispose: vi.fn(),
  } as unknown as MessageBus & { send: ReturnType<typeof vi.fn> };
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
    render(<HostAllowlistPanel bus={createMockBus()} />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });
    expect(screen.getByPlaceholderText(/host/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /allow/i })).toBeDefined();
  });

  it("shows loopback defaults as always-on (not removable)", async () => {
    installChrome(createChromeMock([]));
    render(<HostAllowlistPanel bus={createMockBus()} />);

    await waitFor(() => {
      expect(screen.getByText("localhost")).toBeDefined();
      expect(screen.getByText("127.0.0.1")).toBeDefined();
      expect(screen.getByText("[::1]")).toBeDefined();
    });
    expect(screen.queryAllByRole("button", { name: /remove/i })).toHaveLength(0);
  });
});

describe("HostAllowlistPanel — Allow button routes via background (NOT chrome.permissions.request)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("sends an open-allow-host message to the background on Allow click (normalised host)", () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell:10601" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(bus.send).toHaveBeenCalledTimes(1);
    const [route, message] = bus.send.mock.calls[0] as [string, unknown];
    expect(route).toBe("background");
    const msg = message as { messageType: string; targetRoute: string; payload: { host: string } };
    expect(msg.messageType).toBe("open-allow-host");
    expect(msg.targetRoute).toBe("background");
    expect(msg.payload.host).toBe("subshell");
  });

  it("does NOT call chrome.permissions.request from the panel context", () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mock.permissions.request).not.toHaveBeenCalled();
  });

  it("shows the 'Opening permission prompt…' status after sending", () => {
    installChrome(createChromeMock([]));
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(screen.getByTestId("host-allowlist-status").textContent).toContain(
      "Opening permission prompt",
    );
  });

  it("clears the input after sending the open-allow-host message", () => {
    installChrome(createChromeMock([]));
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    const input = screen.getByPlaceholderText(/host/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "subshell" } });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(input.value).toBe("");
  });

  it("does NOT send the message when input is empty", () => {
    installChrome(createChromeMock([]));
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(bus.send).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("does NOT send the message for invalid (wildcard) input", () => {
    installChrome(createChromeMock([]));
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "*" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(bus.send).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("does NOT send the message when the host is already granted", async () => {
    installChrome(createChromeMock(["subshell"]));
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(bus.send).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows an error when the bus is not ready", () => {
    installChrome(createChromeMock([]));

    render(<HostAllowlistPanel />);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("reflects a granted host when it arrives via storage.onChanged (background sync)", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    // Let the hook's initial storage read resolve before driving the grant,
    // so the async setHosts([]) cannot race the storage.onChanged setHosts([host]).
    await waitFor(() => {
      expect(screen.getByText("localhost")).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    const writeStorage = mock.storage.local.set as (
      items: Record<string, unknown>,
    ) => Promise<void>;
    await writeStorage({ [STORAGE_KEY]: ["subshell"] });

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });
  });
});

describe("HostAllowlistPanel — Remove button (revoke works from DevTools context)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("calls chrome.permissions.remove on Remove click (remove IS allowed from the panel)", async () => {
    const mock = createChromeMock(["subshell"]);
    installChrome(mock);
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

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
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(mock.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: [] });
    });
  });

  it("does NOT call chrome.permissions.request during a revoke", async () => {
    const mock = createChromeMock(["subshell"]);
    installChrome(mock);
    const bus = createMockBus();

    render(<HostAllowlistPanel bus={bus} />);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(mock.permissions.remove).toHaveBeenCalled();
    });
    expect(mock.permissions.request).not.toHaveBeenCalled();
  });
});
