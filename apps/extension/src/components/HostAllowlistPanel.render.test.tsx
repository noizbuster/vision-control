import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChromeMock, renderHostAllowlistPanel } from "./HostAllowlistPanel.test-utils.js";

describe("HostAllowlistPanel — render", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the input field and the host list", async () => {
    renderHostAllowlistPanel(createChromeMock(["subshell"]));

    await waitFor(() => {
      expect(screen.getByText("subshell")).toBeDefined();
    });
    expect(screen.getByPlaceholderText(/host/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /allow/i })).toBeDefined();
  });

  it("shows loopback defaults as always-on (not removable)", async () => {
    renderHostAllowlistPanel(createChromeMock([]));

    await waitFor(() => {
      expect(screen.getByText("localhost")).toBeDefined();
      expect(screen.getByText("127.0.0.1")).toBeDefined();
      expect(screen.getByText("[::1]")).toBeDefined();
    });
    expect(screen.queryAllByRole("button", { name: /remove/i })).toHaveLength(0);
  });
});
