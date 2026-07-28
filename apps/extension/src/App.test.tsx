import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeGroup, makeSummary, setupChromeStubs } from "./App.test-fixtures.js";
import type { SelectionOriginState } from "./hooks/useSelectionSummary.js";
import {
  type BusMessageHandler,
  type ComponentPropEntry,
  createInteractionModeClearedMessage,
  type FrameInfo,
  type GridPlacementMessage,
  type MessageBus,
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

describe("App panel slots", () => {
  beforeEach(() => {
    setupChromeStubs("light");
    resetSlotState();
  });

  afterEach(cleanup);

  it("renders without crashing and shows the inspected tab URL", () => {
    render(<App />);
    expect(screen.getByText("Vision Control")).toBeDefined();
    return waitFor(() =>
      expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/"),
    );
  });

  it("reflects the dark theme class when the system prefers dark", () => {
    setupChromeStubs("dark");
    render(<App />);
    expect(document.querySelector(".app--dark")).not.toBeNull();
  });

  it("renders the empty inspector state when no element is selected and no group exists", () => {
    render(<App />);
    expect(screen.getByText(/Select an element on the page to inspect/)).toBeDefined();
    expect(screen.queryByText("Multi-Select Group")).toBeNull();
    expect(screen.queryByText("Auto Layout")).toBeNull();
    expect(screen.queryByText("Alignment")).toBeNull();
  });

  it("sends Inspect mode to every routeable content frame from the empty inspector state", async () => {
    slotState.frames = [
      {
        frameId: 0,
        url: "http://localhost:3000/",
        origin: "http://localhost:3000",
        routeable: true,
      },
      {
        frameId: 1,
        url: "https://cross.example/",
        origin: "https://cross.example",
        routeable: false,
      },
      {
        frameId: 2,
        url: "http://localhost:3000/frame",
        origin: "http://localhost:3000",
        routeable: true,
      },
    ];
    render(<App />);
    slotState.bus.send.mockClear();

    screen.getByRole("button", { name: "Inspect" }).click();

    await waitFor(() => expect(slotState.bus.send).toHaveBeenCalledTimes(2));
    expect(slotState.bus.send.mock.calls[0]?.[1]).toMatchObject({
      messageType: "interaction-mode",
      targetRoute: "content",
      tabId: 42,
      frameId: 0,
      payload: { mode: "Inspect" },
    });
    expect(slotState.bus.send.mock.calls[1]?.[1]).toMatchObject({
      messageType: "interaction-mode",
      targetRoute: "content",
      tabId: 42,
      frameId: 2,
      payload: { mode: "Inspect" },
    });
  });

  it("replays the current Inspect mode to routeable frames discovered after activation", async () => {
    const { rerender } = render(<App />);
    slotState.bus.send.mockClear();
    screen.getByRole("button", { name: "Inspect" }).click();
    await waitFor(() => expect(slotState.bus.send).toHaveBeenCalledTimes(1));
    slotState.bus.send.mockClear();
    slotState.frames = [
      {
        frameId: 3,
        url: "http://localhost:3000/later",
        origin: "http://localhost:3000",
        routeable: true,
      },
      {
        frameId: 4,
        url: "https://cross.example/later",
        origin: "https://cross.example",
        routeable: false,
      },
    ];

    rerender(<App />);

    await waitFor(() => expect(slotState.bus.send).toHaveBeenCalledTimes(1));
    expect(slotState.bus.send.mock.calls[0]?.[1]).toMatchObject({
      messageType: "interaction-mode",
      targetRoute: "content",
      tabId: 42,
      frameId: 3,
      payload: { mode: "Inspect" },
    });
  });

  it("clears the active Inspect mode when content reports a second Escape", async () => {
    render(<App />);
    const inspectButton = screen.getByRole("button", { name: "Inspect" });
    slotState.bus.send.mockClear();

    inspectButton.click();
    await waitFor(() => expect(slotState.bus.send).toHaveBeenCalledTimes(1));
    slotState.bus.send.mockClear();

    const subscription = slotState.bus.on.mock.calls.find(
      ([messageType]) => messageType === "interaction-mode-cleared",
    );
    const handler = subscription?.[1];
    expect(handler).toBeDefined();
    if (handler === undefined) return;

    act(() => {
      void handler(createInteractionModeClearedMessage(), { route: "content" });
    });

    await waitFor(() => {
      expect(inspectButton.getAttribute("aria-pressed")).toBe("false");
      expect(slotState.bus.send).toHaveBeenCalledWith(
        "content",
        expect.objectContaining({ messageType: "interaction-mode", payload: { mode: null } }),
      );
    });
  });

  it("renders the Multi-Select Group section when a multi-element selection exists", () => {
    slotState.group = makeGroup(3);
    render(<App />);
    expect(screen.getByText("Multi-Select Group")).toBeDefined();
    expect(screen.getByText("grp-0001")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("renders the Alignment panel alongside the multi-select group", () => {
    slotState.group = makeGroup(2);
    render(<App />);
    expect(screen.getByText("Alignment")).toBeDefined();
    expect(document.querySelector("[data-vc-alignment-panel]")).not.toBeNull();
  });

  it("renders the Auto Layout panel when a flex container is selected", () => {
    slotState.summary = makeSummary("flex");
    render(<App />);
    expect(screen.getByText("Auto Layout")).toBeDefined();
    expect(screen.getByTestId("auto-layout-panel")).not.toBeNull();
  });

  it("renders the Auto Layout panel when a grid container is selected", () => {
    slotState.summary = makeSummary("grid");
    render(<App />);
    expect(screen.getByText("Auto Layout")).toBeDefined();
  });

  it("does not render the Auto Layout panel for a non-layout element", () => {
    slotState.summary = makeSummary("inline");
    render(<App />);
    expect(screen.queryByText("Auto Layout")).toBeNull();
  });

  it("renders the Grid section when grid placement data is present", () => {
    slotState.summary = makeSummary("grid");
    slotState.gridPlacement = {
      gridContainer: { runtimeId: "grid-1", tagName: "div" },
      child: { runtimeId: "child-1", tagName: "div" },
      placement: {
        row: 1,
        column: 1,
        rowEnd: 2,
        columnEnd: 2,
        rowSpan: 1,
        columnSpan: 1,
        rect: { x: 0, y: 0, width: 100, height: 50 },
      },
      spanCandidates: [],
      reorderChoice: null,
      a11yWarning: null,
    };
    render(<App />);
    expect(screen.getByText("Grid")).toBeDefined();
    expect(document.querySelector("[data-vc-grid-panel]")).not.toBeNull();
  });
});
