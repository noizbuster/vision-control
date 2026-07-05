import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "../host-allowlist.js";
import { createChromeMock, renderHostAllowlistPanel } from "./HostAllowlistPanel.test-utils.js";

describe("HostAllowlistPanel — Remove button", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("calls chrome.permissions.remove on Remove click", async () => {
    const mock = createChromeMock(["subshell"]);
    renderHostAllowlistPanel(mock);

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => {
      expect(mock.permissions.remove).toHaveBeenCalledTimes(1);
    });
    const firstCall = mock.permissions.remove.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected chrome.permissions.remove to be called");
    }
    const [callArg] = firstCall;
    expect(callArg.origins).toEqual(["http://subshell/*", "https://subshell/*"]);
  });

  it("removes the host from storage after a successful revoke", async () => {
    const mock = createChromeMock(["subshell"]);
    renderHostAllowlistPanel(mock);

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
    renderHostAllowlistPanel(mock);

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
