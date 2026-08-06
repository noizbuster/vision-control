import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { OperationSchema } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeReparentOperation, makeSummary, setupChromeStubs } from "./App.test-fixtures.js";
import type { SelectionOriginState } from "./hooks/useSelectionSummary.js";
import type {
  BusMessage,
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
    resetSelection: () => {},
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

function deliverPanelMessage(messageType: string, message: BusMessage): void {
  const call = slotState.bus.on.mock.calls.find(
    ([registeredType]) => registeredType === messageType,
  );
  expect(call, `${messageType} handler should be registered`).toBeDefined();
  if (call === undefined) return;
  void call[1](message, { route: "background" });
}

describe("App journal operations", () => {
  beforeEach(() => {
    setupChromeStubs("light");
    resetSlotState();
  });
  afterEach(cleanup);

  it("does not render Component Props when no props are available", () => {
    slotState.summary = makeSummary("inline");
    slotState.componentProps = [];
    render(<App />);
    expect(screen.queryByText("Component Props")).toBeNull();
  });

  it("renders Component Props when a selection has discoverable props", () => {
    slotState.summary = makeSummary("inline");
    slotState.componentProps = [
      {
        name: "variant",
        value: "primary",
        kind: "component-prop",
        componentName: "Button",
        sourceRange: { startLine: 5, startColumn: 10, endLine: 5, endColumn: 18 },
        ownershipContext: "same-component",
      },
    ];
    render(<App />);
    expect(screen.getByText("Component Props")).toBeDefined();
    expect(screen.getByText("Button.variant")).toBeDefined();
  });

  it("does not render Component Props without a selection", () => {
    slotState.summary = null;
    slotState.componentProps = [
      {
        name: "variant",
        value: "primary",
        kind: "component-prop",
        componentName: "Button",
        sourceRange: { startLine: 5, startColumn: 10, endLine: 5, endColumn: 18 },
      },
    ];
    render(<App />);
    expect(screen.queryByText("Component Props")).toBeNull();
  });

  it("sends and records a remove-element command from the delete action", async () => {
    slotState.summary = makeSummary("inline");
    render(<App />);
    screen.getByRole("button", { name: "Delete element" }).click();
    await waitFor(() => expect(screen.getByText("Remove")).toBeDefined());
    const editorMessage = slotState.bus.send.mock.calls
      .map((call) => call[1])
      .find((message) => message.messageType === "editor-command");
    const parsed = OperationSchema.safeParse(editorMessage?.payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.kind !== "remove-element") return;
    expect(parsed.data.element.runtimeId).toBe("runtime-1");
    expect(parsed.data.parent.runtimeId).toBe("parent-1");
  });

  it("records content interaction operations in the change journal", async () => {
    const operation = makeReparentOperation();
    render(<App />);
    deliverPanelMessage("interaction-operation", {
      protocolVersion: "1.0.0",
      messageId: "interaction-operation-op-reparent01",
      messageType: "interaction-operation",
      tabId: 42,
      targetRoute: "panel",
      sourceRoute: "background",
      payload: operation,
      timestamp: 1_700_000_000_000,
    });
    await waitFor(() => expect(screen.getByText("Reparent")).toBeDefined());
    expect(screen.getByTestId("journal-summary").textContent).toContain("source-1[0]");
    expect(screen.getByTestId("journal-summary").textContent).toContain("target-1[0]");
  });

  it("copies an agent handoff prompt with URL, selection context, and journal entries", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    slotState.summary = makeSummary("flex");
    render(<App />);
    deliverPanelMessage("interaction-operation", {
      protocolVersion: "1.0.0",
      messageId: "interaction-operation-op-reparent01",
      messageType: "interaction-operation",
      tabId: 42,
      targetRoute: "panel",
      sourceRoute: "background",
      payload: makeReparentOperation(),
      timestamp: 1_700_000_000_000,
    });
    await waitFor(() => expect(screen.getByText("Reparent")).toBeDefined());
    screen.getByRole("button", { name: "Copy agent prompt" }).click();
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copiedPrompt = writeText.mock.calls[0]?.[0];
    expect(copiedPrompt).toContain("URL: http://localhost:3000/");
    expect(copiedPrompt).toContain("# Vision Context Snapshot");
    expect(copiedPrompt).toContain("#container");
    expect(copiedPrompt).toContain("reparent-element");
    expect(copiedPrompt).toContain("## Operations");
    expect(copiedPrompt).toContain("MCP pair is optional");
    await waitFor(() =>
      expect(screen.getByTestId("agent-prompt-copy-status").textContent).toBe(
        "Agent prompt copied",
      ),
    );
  });
});
