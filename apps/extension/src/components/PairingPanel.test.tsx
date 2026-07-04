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

describe("PairingPanel — valid URL sends daemon-connect payload", () => {
  it("calls onConnect with the exact pasted URL when the URL is valid", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: VALID_URL } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(onConnect).toHaveBeenCalledOnce();
    const sentUrl = onConnect.mock.calls[0]?.[0] as string;
    expect(sentUrl.startsWith("vision-control://pair?")).toBe(true);
    expect(sentUrl).toContain("token=my-bare-token");
  });
});

describe("PairingPanel — invalid input shows reason, does NOT send", () => {
  it("shows a parse reason and does not call onConnect for an empty submit", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows a parse reason and does not call onConnect for a wrong scheme", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: "https://example.com/pair?token=x" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("port");
  });

  it("clears the previous error when a subsequent valid submit succeeds", () => {
    const onConnect = vi.fn();
    renderPanel("disconnected", { onConnect, onDisconnect: vi.fn() });

    const input = screen.getByPlaceholderText(/vision-control:\/\//);
    fireEvent.change(input, { target: { value: "https://wrong-scheme.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(screen.getByRole("alert")).toBeDefined();

    fireEvent.change(input, { target: { value: VALID_URL } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));

    expect(onConnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PairingPanel — connected state shows status + disconnect", () => {
  it("renders a status badge and a Disconnect button when connected", () => {
    const onDisconnect = vi.fn();
    renderPanel("connected", { onConnect: vi.fn(), onDisconnect });

    expect(screen.queryByPlaceholderText(/vision-control:\/\//)).toBeNull();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeDefined();
  });

  it("calls onDisconnect when the Disconnect button is clicked", () => {
    const onDisconnect = vi.fn();
    renderPanel("connected", { onConnect: vi.fn(), onDisconnect });

    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});
