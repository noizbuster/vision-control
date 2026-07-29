import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OperationSchema } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeReadyOriginState, makeSummary, setupChromeStubs } from "./App.test-fixtures.js";
import type { SelectionOriginState } from "./hooks/useSelectionSummary.js";
import type {
  BusMessageHandler,
  ComponentPropEntry,
  FrameInfo,
  GridPlacementMessage,
  MessageBus,
} from "./messaging/index.js";

const { slotState } = vi.hoisted(() => {
  const bus = {
    send: vi.fn<MessageBus["send"]>(),
    on: vi.fn<(messageType: string, handler: BusMessageHandler) => () => void>(() => () => {}),
  };
  const slotState: {
    summary: SelectionSummary | null;
    originState: SelectionOriginState;
    group: MultiSelectGroup | null;
    gridPlacement: GridPlacementMessage | null;
    componentProps: readonly ComponentPropEntry[];
    frames: readonly FrameInfo[];
    bus: typeof bus;
  } = {
    summary: null,
    originState: { status: "idle" },
    group: null,
    gridPlacement: null,
    componentProps: [],
    frames: [],
    bus,
  };
  return { slotState };
});

vi.mock("./hooks/usePanelBus.js", () => ({ usePanelBus: () => slotState.bus }));
vi.mock("./hooks/useSelectionSummary.js", () => ({
  useSelectionSummary: () => ({
    summary: slotState.summary,
    originState: slotState.originState,
    selectElement: () => {},
  }),
}));
vi.mock("./hooks/useFrameTree.js", () => ({ useFrameTree: () => slotState.frames }));
vi.mock("./hooks/useMultiSelect.js", () => ({
  useMultiSelect: () => ({ group: slotState.group }),
}));
vi.mock("./hooks/useGridPlacement.js", () => ({
  useGridPlacement: () => ({ state: slotState.gridPlacement }),
}));
vi.mock("./hooks/useComponentProps.js", () => ({
  useComponentProps: () => ({ componentProps: slotState.componentProps }),
}));

import { App } from "./App.js";

function resetSlotState(): void {
  slotState.summary = null;
  slotState.originState = { status: "idle" };
  slotState.group = null;
  slotState.gridPlacement = null;
  slotState.componentProps = [];
  slotState.frames = [];
  slotState.bus.send.mockClear();
  slotState.bus.on.mockClear();
}

describe("App context and optional pairing", () => {
  beforeEach(() => {
    setupChromeStubs("light");
    resetSlotState();
  });
  afterEach(cleanup);

  it("copies current selection context without stale origins while hints are unavailable", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    slotState.summary = makeSummary("inline");
    slotState.originState = { status: "pending", revision: 1, runtimeId: "runtime-1" };
    const { rerender } = render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/"),
    );

    const copyButton = screen.getByRole("button", { name: "Copy for agent" });
    expect(copyButton).toHaveProperty("disabled", false);
    expect(screen.getByTestId("selection-copy-status").textContent).toBe("Resolving source hints");
    copyButton.click();
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).toContain("origins: []");
    expect(writeText.mock.calls[0]?.[0]).toContain("origins_truncated: false");
    await waitFor(() =>
      expect(screen.getByTestId("selection-copy-status").textContent).toBe(
        "Selection context copied",
      ),
    );

    writeText.mockClear();
    slotState.originState = makeReadyOriginState("runtime-2");
    rerender(<App />);
    screen.getByRole("button", { name: "Copy for agent" }).click();
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).not.toContain("src/components/Checkout.tsx");
    expect(writeText.mock.calls[0]?.[0]).not.toContain("src/styles/checkout.css");
  });

  it("reports a pending copy completion after source hints become ready", async () => {
    let resolveWrite: (() => void) | undefined;
    const writeText = vi.fn<(text: string) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    slotState.summary = makeSummary("inline");
    slotState.originState = { status: "pending", revision: 1, runtimeId: "runtime-1" };
    const { rerender } = render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/"),
    );
    expect(screen.getByRole("button", { name: "Copy for agent" })).toHaveProperty(
      "disabled",
      false,
    );

    screen.getByRole("button", { name: "Copy for agent" }).click();
    slotState.originState = makeReadyOriginState();
    rerender(<App />);
    await act(async () => resolveWrite?.());

    await waitFor(() =>
      expect(screen.getByTestId("selection-copy-status").textContent).toBe(
        "Selection context copied",
      ),
    );
  });

  it("ignores an obsolete clipboard result after the selection changes", async () => {
    const resolveWrites: Array<() => void> = [];
    const writeText = vi.fn<(text: string) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveWrites.push(resolve);
        }),
    );
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    slotState.summary = makeSummary("inline");
    slotState.originState = { status: "pending", revision: 1, runtimeId: "runtime-1" };
    const { rerender } = render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/"),
    );

    screen.getByRole("button", { name: "Copy for agent" }).click();
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());

    const nextSummary = makeSummary("block");
    slotState.summary = {
      ...nextSummary,
      identity: {
        ...nextSummary.identity,
        runtimeId: "runtime-2",
        selector: "#next",
      },
    };
    slotState.originState = { status: "pending", revision: 2, runtimeId: "runtime-2" };
    rerender(<App />);
    expect(screen.getByTestId("selection-copy-status").textContent).toBe("Resolving source hints");

    await act(async () => resolveWrites[0]?.());
    expect(screen.getByTestId("selection-copy-status").textContent).toBe("Resolving source hints");

    screen.getByRole("button", { name: "Copy for agent" }).click();
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    await act(async () => resolveWrites[1]?.());
    await waitFor(() =>
      expect(screen.getByTestId("selection-copy-status").textContent).toBe(
        "Selection context copied",
      ),
    );
  });

  it("copies matching ready selection context with every origin and reports success", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    slotState.summary = makeSummary("inline");
    slotState.originState = makeReadyOriginState();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy for agent" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    screen.getByRole("button", { name: "Copy for agent" }).click();
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copiedContext = writeText.mock.calls[0]?.[0];
    expect(copiedContext).toContain('page_url: "http://localhost:3000/"');
    expect(copiedContext).toContain('selector: "#container"');
    expect(copiedContext).toContain("semantic:");
    expect(copiedContext).toContain('"tagName":"div"');
    expect(copiedContext).toContain("breadcrumb:");
    expect(copiedContext).toContain('"selector":"#container"');
    expect(copiedContext).toContain("src/components/Checkout.tsx");
    expect(copiedContext).toContain("src/styles/checkout.css");
    expect(copiedContext).toContain("origins_truncated: true");
    await waitFor(() =>
      expect(screen.getByTestId("selection-copy-status").textContent).toBe(
        "Selection context copied",
      ),
    );
  });

  it("reports a failed selection context copy", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error("clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    slotState.summary = makeSummary("inline");
    slotState.originState = makeReadyOriginState();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy for agent" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    screen.getByRole("button", { name: "Copy for agent" }).click();
    await waitFor(() =>
      expect(screen.getByTestId("selection-copy-status").textContent).toBe("Copy failed"),
    );
  });

  it("keeps inspector and edit path usable while the agent bridge is unpaired", async () => {
    slotState.summary = makeSummary("inline");
    render(<App />);
    const pairing = screen.getByTestId("pairing-panel");
    expect(pairing.getAttribute("data-editing-ready")).toBe("true");
    expect(pairing.getAttribute("data-pairing-optional")).toBe("true");
    expect(pairing.getAttribute("data-agent-pair-state")).toBe("disconnected");
    expect(pairing.textContent?.toLowerCase()).not.toContain("daemon required");
    expect(screen.getByRole("button", { name: "Delete element" })).toBeDefined();
    expect(screen.getByTestId("editing-ready")).toBeDefined();
    slotState.bus.send.mockClear();
    screen.getByRole("button", { name: "Delete element" }).click();
    await waitFor(() => {
      const editorMessage = slotState.bus.send.mock.calls
        .map((call) => call[1])
        .find((message) => message.messageType === "editor-command");
      const parsed = OperationSchema.safeParse(editorMessage?.payload);
      expect(parsed.success ? parsed.data.kind : undefined).toBe("remove-element");
    });
  });

  it("pairs the optional agent bridge with an inspected-tab envelope", async () => {
    const pairingUrl = "vision-control://pair?token=abc&port=4322&host=127.0.0.1";
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText(/vision-control:\/\//), {
      target: { value: pairingUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: /pair agent/i }));
    await waitFor(() => {
      const connectMessage = slotState.bus.send.mock.calls
        .map((call) => call[1])
        .find((message) => message.messageType === "bridge-connect");
      expect(connectMessage).toBeDefined();
      expect(connectMessage?.tabId).toBe(42);
      expect(connectMessage?.payload).toEqual({ pairingUrl });
    });
    expect(
      slotState.bus.send.mock.calls.some((call) => call[1].messageType === "daemon-connect"),
    ).toBe(false);
  });
});
