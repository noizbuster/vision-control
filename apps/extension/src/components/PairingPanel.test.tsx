import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConnectionState } from "../messaging/index.js";
import { PairingPanel } from "./PairingPanel.js";

const VALID_URL = "vision-control://pair?token=abc&port=8080&host=127.0.0.1";

afterEach(() => {
  cleanup();
});

function renderPanel(
  status: ConnectionState,
  handlers: { onConnect: (url: string) => void; onDisconnect: () => void },
): void {
  render(
    <PairingPanel
      status={status}
      onConnect={handlers.onConnect}
      onDisconnect={handlers.onDisconnect}
    />,
  );
}

describe("PairingPanel — offline-first optional agent pair", () => {
  it("marks editing ready and pairing optional when agent is unpaired", () => {
    renderPanel("disconnected", { onConnect: vi.fn(), onDisconnect: vi.fn() });

    const panel = screen.getByTestId("pairing-panel");
    expect(panel.getAttribute("data-editing-ready")).toBe("true");
    expect(panel.getAttribute("data-pairing-optional")).toBe("true");
    expect(panel.getAttribute("data-agent-pair-state")).toBe("disconnected");
    expect(screen.getByTestId("editing-ready").getAttribute("data-testid")).toBe("editing-ready");
    expect(screen.getByTestId("agent-pair-status").getAttribute("data-agent-pair-state")).toBe(
      "disconnected",
    );
    expect(screen.getByTestId("pairing-optional-badge").textContent?.toLowerCase()).toContain(
      "optional",
    );
    expect(panel.textContent?.toLowerCase()).not.toContain("daemon required");
    expect(panel.textContent?.toLowerCase()).not.toMatch(/daemon required for editing/);
  });

  it("keeps editing-ready when agent is paired", () => {
    renderPanel("connected", { onConnect: vi.fn(), onDisconnect: vi.fn() });

    const panel = screen.getByTestId("pairing-panel");
    expect(panel.getAttribute("data-editing-ready")).toBe("true");
    expect(panel.getAttribute("data-agent-pair-state")).toBe("connected");
    expect(screen.getByTestId("connection-status").getAttribute("data-editing-ready")).toBe("true");
  });
});

describe("PairingPanel — valid URL sends bridge connect payload", () => {
  it("calls onConnect with the exact pasted URL when the URL is valid", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: VALID_URL } });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect.mock.calls[0]?.[0]).toBe(VALID_URL);
  });

  it("calls onConnect when submitting via the Enter key", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: VALID_URL } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect.mock.calls[0]?.[0]).toBe(VALID_URL);
  });
});

describe("PairingPanel — bare token fallback (defaults host/port)", () => {
  it("accepts a bare token and calls onConnect with a synthesized full URL", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: "my-bare-token" } });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));

    expect(onConnect).toHaveBeenCalledOnce();
    const sentUrl = onConnect.mock.calls[0]?.[0] as string;
    expect(sentUrl.startsWith("vision-control://pair?")).toBe(true);
    expect(sentUrl).toContain("token=my-bare-token");
    expect(sentUrl).toContain("port=4322");
    expect(sentUrl).not.toContain("port=4321");
  });
});

describe("PairingPanel — invalid input shows reason, does NOT send", () => {
  it("shows a parse reason and does not call onConnect for an empty submit", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows a parse reason and does not call onConnect for a wrong scheme", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: "https://example.com/pair?token=x" } });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows a parse reason and does not call onConnect for a missing token", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, {
      target: { value: "vision-control://pair?port=8080&host=127.0.0.1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows a parse reason for a bad port and does not call onConnect", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, {
      target: { value: "vision-control://pair?token=abc&port=notaport&host=127.0.0.1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("port");
  });

  it("clears the previous error when a subsequent valid submit succeeds", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: "https://wrong-scheme.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));
    expect(screen.getByRole("alert")).toBeDefined();

    fireEvent.change(input, { target: { value: VALID_URL } });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));

    expect(onConnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PairingPanel — connected state shows status + unpair", () => {
  it("renders agent-pair status and an Unpair agent button when connected", () => {
    const onDisconnect = vi.fn();
    renderPanel("connected", { onConnect: vi.fn(), onDisconnect });

    expect(screen.queryByPlaceholderText(/vision-control:\/\//)).toBeNull();
    expect(screen.getByRole("button", { name: /unpair agent/i })).toBeDefined();
    expect(screen.getByTestId("agent-pair-status").getAttribute("data-agent-pair-state")).toBe(
      "connected",
    );
  });

  it("calls onDisconnect when the Unpair agent button is clicked", () => {
    const onDisconnect = vi.fn();
    renderPanel("connected", { onConnect: vi.fn(), onDisconnect });

    fireEvent.click(screen.getByRole("button", { name: /unpair agent/i }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});
