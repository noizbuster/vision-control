import { beforeEach, describe, expect, it, vi } from "vitest";

import { hostToOriginPatterns } from "./host-allowlist.js";
import { requestHostPermission, revokeHostPermission } from "./host-permissions.js";

interface PermissionsMock {
  request: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function createPermissionsMock(): PermissionsMock {
  return {
    request: vi.fn(),
    remove: vi.fn(),
  };
}

function installChrome(permissions: PermissionsMock): void {
  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    configurable: true,
    value: { permissions },
  });
}

describe("requestHostPermission", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls chrome.permissions.request with http + https origin patterns for the host", async () => {
    const permissions = createPermissionsMock();
    permissions.request.mockResolvedValue(true);
    installChrome(permissions);

    const result = await requestHostPermission("subshell");

    expect(result).toBe(true);
    expect(permissions.request).toHaveBeenCalledTimes(1);
    const callArg = permissions.request.mock.calls[0]?.[0] as { origins: string[] };
    expect(callArg.origins).toEqual([...hostToOriginPatterns("subshell")]);
  });

  it("returns false when the user denies the permission prompt", async () => {
    const permissions = createPermissionsMock();
    permissions.request.mockResolvedValue(false);
    installChrome(permissions);

    const result = await requestHostPermission("subshell");

    expect(result).toBe(false);
  });

  it("returns false when chrome.permissions is unavailable", async () => {
    Object.defineProperty(globalThis, "chrome", {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const result = await requestHostPermission("subshell");
    expect(result).toBe(false);
  });

  it("returns false and does not throw when chrome.permissions.request throws", async () => {
    const permissions = createPermissionsMock();
    permissions.request.mockRejectedValue(new Error("user gesture required"));
    installChrome(permissions);

    const result = await requestHostPermission("subshell");
    expect(result).toBe(false);
  });
});

describe("revokeHostPermission", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls chrome.permissions.remove with the host's origin patterns", async () => {
    const permissions = createPermissionsMock();
    permissions.remove.mockResolvedValue(true);
    installChrome(permissions);

    const result = await revokeHostPermission("subshell");

    expect(result).toBe(true);
    expect(permissions.remove).toHaveBeenCalledTimes(1);
    const callArg = permissions.remove.mock.calls[0]?.[0] as { origins: string[] };
    expect(callArg.origins).toEqual([...hostToOriginPatterns("subshell")]);
  });

  it("returns false when the removal fails", async () => {
    const permissions = createPermissionsMock();
    permissions.remove.mockResolvedValue(false);
    installChrome(permissions);

    const result = await revokeHostPermission("subshell");
    expect(result).toBe(false);
  });

  it("returns false when chrome.permissions is unavailable", async () => {
    Object.defineProperty(globalThis, "chrome", {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const result = await revokeHostPermission("subshell");
    expect(result).toBe(false);
  });
});
