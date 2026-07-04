import { cleanup, render, screen } from "@testing-library/react";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import { createMultiSelectGroupId } from "@vision-control/element-identity";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentPropEntry, GridPlacementMessage } from "./messaging/index.js";

const { slotState } = vi.hoisted(() => ({
  slotState: {
    summary: null as SelectionSummary | null,
    group: null as MultiSelectGroup | null,
    gridPlacement: null as GridPlacementMessage | null,
    componentProps: [] as readonly ComponentPropEntry[],
  },
}));

vi.mock("./hooks/useSelectionSummary.js", () => ({
  useSelectionSummary: () => ({ summary: slotState.summary, selectElement: () => {} }),
}));
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

function setupChromeStubs(theme: "dark" | "light") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && theme === "dark",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });

  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    value: {
      devtools: {
        inspectedWindow: { tabId: 42 },
      },
      runtime: {
        lastError: undefined,
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => {}, removeListener: () => {} },
        connect: () => ({
          onMessage: { addListener: () => {}, removeListener: () => {} },
          onDisconnect: { addListener: () => {}, removeListener: () => {} },
          disconnect: () => {},
          postMessage: () => {},
        }),
      },
      tabs: {
        get: (_tabId: number, callback: (tab: { title?: string; url?: string }) => void) => {
          callback({ title: "Test page", url: "http://localhost:3000/" });
        },
      },
    },
  });
}

function makeSummary(display: string): SelectionSummary {
  return {
    identity: {
      runtimeId: "runtime-1",
      tagName: "div",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#container",
    },
    breadcrumb: [
      { tagName: "body", selector: "body" },
      { tagName: "div", selector: "#container" },
    ],
    computedStyle: {
      display: display as "flex",
      position: "static",
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "flex-start",
      flexBasis: "auto",
      flexGrow: "0",
      width: "auto",
      height: "auto",
      padding: "0px",
      margin: "0px",
      border: "0px none rgb(0, 0, 0)",
      color: "rgb(0, 0, 0)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "normal",
    },
    boxModel: {
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      content: { width: 400, height: 200 },
      position: { x: 0, y: 0 },
    },
    classList: [],
    attributes: [],
    semantic: {
      tagName: "div",
      textContentPreview: "",
    },
    siblingSummary: { count: 1, index: 0, parentTagName: "body" },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
  };
}

function makeGroup(memberCount = 2): MultiSelectGroup {
  const members = Array.from({ length: memberCount }, (_, i) => ({
    runtimeId: `runtime-${i}`,
    tagName: "div",
    frameId: "main",
    frameKind: "top" as const,
    shadowKind: "light-dom" as const,
  }));
  return {
    id: createMultiSelectGroupId("grp-0001"),
    members,
    frameId: "main",
    frameKind: "top",
    shadowKind: "light-dom",
    shadowRootCompatible: true,
    commonParent: null,
    boundingRect: { x: 0, y: 0, width: 200, height: 100 },
  };
}

function resetSlotState(): void {
  slotState.summary = null;
  slotState.group = null;
  slotState.gridPlacement = null;
  slotState.componentProps = [];
}

describe("App", () => {
  beforeEach(() => {
    setupChromeStubs("light");
    resetSlotState();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without crashing and shows the inspected tab URL", () => {
    render(<App />);
    expect(screen.getByText("Vision Control")).toBeDefined();
    expect(screen.getByTestId("inspected-url").textContent).toContain("http://localhost:3000/");
  });

  it("reflects the dark theme class when the system prefers dark", () => {
    setupChromeStubs("dark");
    render(<App />);
    expect(document.querySelector(".app--dark")).not.toBeNull();
  });

  it("renders the empty inspector state when no element is selected and no group exists", () => {
    render(<App />);
    expect(screen.getByText("Select an element to inspect.")).toBeDefined();
    expect(screen.queryByText("Multi-Select Group")).toBeNull();
    expect(screen.queryByText("Auto Layout")).toBeNull();
    expect(screen.queryByText("Alignment")).toBeNull();
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

  it("does not render the Component Props section when componentProps is empty (baseline)", () => {
    slotState.summary = makeSummary("inline");
    slotState.componentProps = [];
    render(<App />);

    expect(screen.queryByText("Component Props")).toBeNull();
  });

  it("renders the Component Props section when a selection has discoverable props (showPropsPanel true)", () => {
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

  it("does not render the Component Props section when props exist but no selection (additive-slot contract)", () => {
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
});
