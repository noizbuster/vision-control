import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAllowHostPageUrl,
  performHostGrant,
  persistGrantedHost,
  runAllowHostGrant,
  validateHostForGrant,
} from "./allow-host-page.js";
import { hostToOriginPatterns, STORAGE_KEY } from "./host-allowlist.js";

interface PermissionsMock {
  request: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

interface ChromeMock {
  permissions: PermissionsMock;
  storage: {
    local: {
      store: Record<string, unknown>;
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
  };
}

function createChromeMock(initialHosts: readonly string[] = [], requestResult = true): ChromeMock {
  const store: Record<string, unknown> = { [STORAGE_KEY]: [...initialHosts] };
  return {
    permissions: {
      request: vi.fn().mockResolvedValue(requestResult),
      remove: vi.fn().mockResolvedValue(true),
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
          Object.assign(store, items);
        }),
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

describe("validateHostForGrant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns missing for a null input (no host query param)", () => {
    expect(validateHostForGrant(null)).toEqual({ valid: false, reason: "missing" });
  });

  it("returns missing for empty/whitespace input", () => {
    expect(validateHostForGrant("")).toEqual({ valid: false, reason: "missing" });
    expect(validateHostForGrant("   ")).toEqual({ valid: false, reason: "missing" });
  });

  it("returns invalid for a wildcard host", () => {
    expect(validateHostForGrant("*")).toEqual({ valid: false, reason: "invalid" });
  });

  it("normalises a host:port input to a bare hostname", () => {
    expect(validateHostForGrant("subshell:10601")).toEqual({ valid: true, host: "subshell" });
  });

  it("strips a scheme prefix and path", () => {
    expect(validateHostForGrant("http://subshell:10601/app")).toEqual({
      valid: true,
      host: "subshell",
    });
  });

  it("lowercases the hostname", () => {
    expect(validateHostForGrant("SubShell")).toEqual({ valid: true, host: "subshell" });
  });
});

describe("buildAllowHostPageUrl", () => {
  it("builds the extension-relative URL with the encoded host", () => {
    expect(buildAllowHostPageUrl("subshell")).toBe("allow-host.html?host=subshell");
  });

  it("encodes hosts that contain reserved URL characters", () => {
    expect(buildAllowHostPageUrl("sub shell")).toBe("allow-host.html?host=sub%20shell");
  });
});

describe("performHostGrant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the http+https origin patterns for the host (the page-script contract)", async () => {
    const mock = createChromeMock();
    installChrome(mock);

    const outcome = await performHostGrant("subshell");

    expect(outcome).toBe("granted");
    expect(mock.permissions.request).toHaveBeenCalledTimes(1);
    const callArg = mock.permissions.request.mock.calls[0]?.[0] as { origins: string[] };
    expect(callArg.origins).toEqual([...hostToOriginPatterns("subshell")]);
  });

  it("returns denied when the user rejects the prompt", async () => {
    const mock = createChromeMock([], false);
    installChrome(mock);

    const outcome = await performHostGrant("subshell");

    expect(outcome).toBe("denied");
    expect(mock.storage.local.set).not.toHaveBeenCalled();
  });

  it("persists the granted host to storage on grant", async () => {
    const mock = createChromeMock([]);
    installChrome(mock);

    await performHostGrant("subshell");

    expect(mock.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell"] });
  });

  it("merges with existing granted hosts instead of overwriting", async () => {
    const mock = createChromeMock(["other-host"]);
    installChrome(mock);

    await performHostGrant("subshell");

    expect(mock.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEY]: ["other-host", "subshell"],
    });
  });

  it("does not duplicate a host already in storage", async () => {
    const mock = createChromeMock(["subshell"]);
    installChrome(mock);

    await performHostGrant("subshell");

    expect(mock.storage.local.set).not.toHaveBeenCalled();
  });
});

describe("runAllowHostGrant (full page flow)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns missing outcome without requesting when host param is absent", async () => {
    const mock = createChromeMock();
    installChrome(mock);

    const result = await runAllowHostGrant(null);

    expect(result).toEqual({ outcome: "missing", host: null });
    expect(mock.permissions.request).not.toHaveBeenCalled();
  });

  it("returns invalid outcome for a wildcard host without requesting", async () => {
    const mock = createChromeMock();
    installChrome(mock);

    const result = await runAllowHostGrant("*");

    expect(result).toEqual({ outcome: "invalid", host: null });
    expect(mock.permissions.request).not.toHaveBeenCalled();
  });

  it("returns granted outcome and writes storage for a valid host", async () => {
    const mock = createChromeMock();
    installChrome(mock);

    const result = await runAllowHostGrant("subshell:10601");

    expect(result).toEqual({ outcome: "granted", host: "subshell" });
    expect(mock.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell"] });
  });

  it("returns denied outcome and skips storage when the prompt is rejected", async () => {
    const mock = createChromeMock([], false);
    installChrome(mock);

    const result = await runAllowHostGrant("subshell");

    expect(result).toEqual({ outcome: "denied", host: "subshell" });
    expect(mock.storage.local.set).not.toHaveBeenCalled();
  });
});

describe("persistGrantedHost", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no-ops when chrome is undefined", async () => {
    Object.defineProperty(globalThis, "chrome", {
      writable: true,
      configurable: true,
      value: undefined,
    });

    await expect(persistGrantedHost("subshell")).resolves.toBeUndefined();
  });
});
