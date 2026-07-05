import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "../host-allowlist.js";
import { createChromeMock, renderHostAllowlistPanel } from "./HostAllowlistPanel.test-utils.js";

describe("HostAllowlistPanel — Allow button", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("normalizes input and calls chrome.permissions.request with the right origins on Allow click", async () => {
    const mock = createChromeMock([]);
    renderHostAllowlistPanel(mock);

    const input = screen.getByPlaceholderText(/host/i);
    fireEvent.change(input, { target: { value: "subshell:10601" } });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(mock.permissions.request).toHaveBeenCalledTimes(1);
    });
    const firstCall = mock.permissions.request.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected chrome.permissions.request to be called");
    }
    const [callArg] = firstCall;
    expect(callArg.origins).toEqual(["http://subshell/*", "https://subshell/*"]);
  });

  it("persists the granted host to storage after a successful permission grant", async () => {
    const mock = createChromeMock([]);
    renderHostAllowlistPanel(mock);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(mock.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: ["subshell"] });
    });
  });

  it("notifies the background to inject already-open tabs after a successful grant", async () => {
    const mock = createChromeMock([]);
    renderHostAllowlistPanel(mock);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "subshell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ messageType: "host-access-changed", targetRoute: "background" }),
      );
    });
  });

  it("does NOT call chrome.permissions.request when input is empty", async () => {
    const mock = createChromeMock([]);
    renderHostAllowlistPanel(mock);

    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mock.permissions.request).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("does NOT call chrome.permissions.request for invalid input", async () => {
    const mock = createChromeMock([]);
    renderHostAllowlistPanel(mock);

    fireEvent.change(screen.getByPlaceholderText(/host/i), {
      target: { value: "*" },
    });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    expect(mock.permissions.request).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows an error when the user denies the permission prompt", async () => {
    const mock = createChromeMock([], false);
    renderHostAllowlistPanel(mock);

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
    renderHostAllowlistPanel(mock);

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
    renderHostAllowlistPanel(mock);

    const input = screen.getByPlaceholderText(/host/i);
    if (!(input instanceof HTMLInputElement)) {
      throw new TypeError("Expected host input to be an HTML input element");
    }
    fireEvent.change(input, { target: { value: "subshell" } });
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));

    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });
});
