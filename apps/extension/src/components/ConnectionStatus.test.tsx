import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ConnectionState } from "../messaging/index.js";
import { agentPairLabel, ConnectionStatus } from "./ConnectionStatus.js";

afterEach(() => {
  cleanup();
});

const STATES: readonly ConnectionState[] = [
  "disconnected",
  "connecting",
  "connected",
  "reconnecting",
];

describe("ConnectionStatus — editing-ready vs agent-pair", () => {
  it.each(STATES)("always reports editing-ready when agent pair is %s", (status) => {
    render(<ConnectionStatus status={status} />);

    const root = screen.getByTestId("connection-status");
    expect(root.getAttribute("data-editing-ready")).toBe("true");
    expect(root.getAttribute("data-agent-pair-state")).toBe(status);
    expect(screen.getByTestId("agent-pair-status").getAttribute("data-agent-pair-state")).toBe(
      status,
    );
    expect(screen.getByTestId("agent-pair-status").textContent).toBe(agentPairLabel(status));
  });

  it("does not present agent pair as a daemon editing requirement", () => {
    render(<ConnectionStatus status="disconnected" />);
    const text = screen.getByTestId("connection-status").textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("daemon required");
    expect(text).toContain("editing ready");
  });
});
