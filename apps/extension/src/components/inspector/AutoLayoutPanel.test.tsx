import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  SetChildSizingOperation,
  SetContainerLayoutOperation,
} from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { createSpacingTokenProvider } from "@vision-control/layout-engine";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoLayoutPanel } from "./AutoLayoutPanel.js";

function makeSummary(display: string, flexDirection = "row"): SelectionSummary {
  return {
    identity: {
      runtimeId: "runtime-flex-1",
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
      display,
      position: "static",
      flexDirection,
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
    attributes: [{ name: "id", value: "container" }],
    semantic: { tagName: "div", textContentPreview: "" },
    siblingSummary: { count: 1, index: 0, parentTagName: "body" },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
  };
}

describe("AutoLayoutPanel — supported container", () => {
  afterEach(cleanup);

  it("renders the panel for a flex-row container", () => {
    render(<AutoLayoutPanel summary={makeSummary("flex", "row")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-panel")).toBeDefined();
  });

  it("renders the panel for a flex-column container", () => {
    render(<AutoLayoutPanel summary={makeSummary("flex", "column")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-panel")).toBeDefined();
  });

  it("renders the panel for a grid container", () => {
    render(<AutoLayoutPanel summary={makeSummary("grid")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-panel")).toBeDefined();
  });

  it("renders the panel for a block container", () => {
    render(<AutoLayoutPanel summary={makeSummary("block")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-panel")).toBeDefined();
  });

  it("shows the container role label", () => {
    render(<AutoLayoutPanel summary={makeSummary("flex", "row")} onCommand={vi.fn()} />);
    expect(screen.getByText("flex-container")).toBeDefined();
  });

  it("shows direction control for flex containers", () => {
    render(<AutoLayoutPanel summary={makeSummary("flex", "row")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-direction")).toBeDefined();
  });

  it("hides direction control for block containers (not flex)", () => {
    render(<AutoLayoutPanel summary={makeSummary("block")} onCommand={vi.fn()} />);
    expect(() => screen.getByTestId("auto-layout-direction")).toThrow();
  });

  it("emits set-container-layout when direction changes", () => {
    const onCommand = vi.fn();
    render(<AutoLayoutPanel summary={makeSummary("flex", "row")} onCommand={onCommand} />);
    fireEvent.change(screen.getByTestId("auto-layout-direction"), { target: { value: "column" } });
    expect(onCommand).toHaveBeenCalledTimes(1);
    const op = onCommand.mock.calls[0]?.[0] as SetContainerLayoutOperation;
    expect(op.kind).toBe("set-container-layout");
    expect(op.property).toBe("flex-direction");
    expect(op.value).toBe("column");
    expect(op.runtime).toBe(false);
  });

  it("emits set-container-layout for gap when Apply is clicked", () => {
    const onCommand = vi.fn();
    render(<AutoLayoutPanel summary={makeSummary("flex")} onCommand={onCommand} />);
    fireEvent.change(screen.getByTestId("auto-layout-gap-input"), { target: { value: "1rem" } });
    screen.getByTestId("auto-layout-gap-apply").click();
    expect(onCommand).toHaveBeenCalledTimes(1);
    const op = onCommand.mock.calls[0]?.[0] as SetContainerLayoutOperation;
    expect(op.property).toBe("gap");
    expect(op.value).toBe("1rem");
  });

  it("emits multiple set-container-layout for horizontal padding", () => {
    const onCommand = vi.fn();
    render(<AutoLayoutPanel summary={makeSummary("flex")} onCommand={onCommand} />);
    fireEvent.change(screen.getByTestId("auto-layout-padding-mode"), {
      target: { value: "horizontal" },
    });
    fireEvent.change(screen.getByTestId("auto-layout-padding-input"), {
      target: { value: "12px" },
    });
    screen.getByTestId("auto-layout-padding-apply").click();
    expect(onCommand).toHaveBeenCalledTimes(2);
    const props = onCommand.mock.calls.map(
      (call) => (call[0] as SetContainerLayoutOperation).property,
    );
    expect(props).toContain("padding-left");
    expect(props).toContain("padding-right");
  });

  it("emits set-child-sizing for hug intent", () => {
    const onCommand = vi.fn();
    render(<AutoLayoutPanel summary={makeSummary("flex", "row")} onCommand={onCommand} />);
    screen.getByTestId("auto-layout-child-apply").click();
    expect(onCommand).toHaveBeenCalledTimes(1);
    const op = onCommand.mock.calls[0]?.[0] as SetChildSizingOperation;
    expect(op.kind).toBe("set-child-sizing");
    expect(op.sizing).toBe("hug");
    expect(op.runtime).toBe(false);
  });
});

describe("AutoLayoutPanel — unsupported container diagnostic", () => {
  afterEach(cleanup);

  it("shows unsupported diagnostic for inline elements", () => {
    render(<AutoLayoutPanel summary={makeSummary("inline")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-unsupported")).toBeDefined();
  });

  it("shows unsupported diagnostic for inline-block elements", () => {
    render(<AutoLayoutPanel summary={makeSummary("inline-block")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-unsupported")).toBeDefined();
  });

  it("shows unsupported diagnostic for unknown display", () => {
    render(<AutoLayoutPanel summary={makeSummary("contents")} onCommand={vi.fn()} />);
    expect(screen.getByTestId("auto-layout-unsupported")).toBeDefined();
  });

  it("does NOT emit any operations for unsupported containers", () => {
    const onCommand = vi.fn();
    render(<AutoLayoutPanel summary={makeSummary("inline")} onCommand={onCommand} />);
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe("AutoLayoutPanel — Tailwind token suggestions", () => {
  afterEach(cleanup);

  it("shows token hint when a spacing provider is available and gap value entered", () => {
    const provider = createSpacingTokenProvider({ spacing: { "4": "1rem" } });
    render(
      <AutoLayoutPanel
        summary={makeSummary("flex")}
        onCommand={vi.fn()}
        tokenProviders={[provider]}
      />,
    );
    fireEvent.change(screen.getByTestId("auto-layout-gap-input"), { target: { value: "1rem" } });
    expect(screen.getByText(/gap-4/)).toBeDefined();
  });

  it("does not show token hint when no provider is available", () => {
    render(<AutoLayoutPanel summary={makeSummary("flex")} onCommand={vi.fn()} />);
    fireEvent.change(screen.getByTestId("auto-layout-gap-input"), { target: { value: "1rem" } });
    expect(() => screen.getByText(/gap-/)).toThrow();
  });
});
