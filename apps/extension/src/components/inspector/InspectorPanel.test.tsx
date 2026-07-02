import { cleanup, render, screen } from "@testing-library/react";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorPanel } from "./InspectorPanel.js";

function makeSummary(): SelectionSummary {
  return {
    identity: {
      runtimeId: "runtime-1",
      tagName: "button",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#submit",
    },
    breadcrumb: [
      { tagName: "body", selector: "body" },
      { tagName: "button", selector: "#submit" },
    ],
    computedStyle: {
      display: "inline-block",
      position: "static",
      flexDirection: "row",
      alignItems: "center",
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
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      border: { top: 2, right: 2, bottom: 2, left: 2 },
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      content: { width: 100, height: 40 },
      position: { x: 0, y: 0 },
    },
    classList: [
      { name: "btn", source: "unknown" },
      { name: "primary", source: "unknown" },
    ],
    attributes: [
      { name: "id", value: "submit" },
      { name: "type", value: "submit" },
    ],
    semantic: {
      tagName: "button",
      role: "button",
      name: "Submit",
      textContentPreview: "Submit",
    },
    siblingSummary: {
      count: 3,
      index: 1,
      parentTagName: "form",
    },
    parentLayout: {
      mode: "block",
      display: "block",
    },
    sourceConfidence: "high",
  };
}

describe("InspectorPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an empty state when summary is null", () => {
    render(<InspectorPanel summary={null} onSelectElement={vi.fn()} />);

    expect(screen.getByText("Select an element to inspect.")).toBeDefined();
  });

  it("renders all summary sections", () => {
    render(<InspectorPanel summary={makeSummary()} onSelectElement={vi.fn()} />);

    expect(screen.getAllByText("Identity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Breadcrumb").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Semantic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Box Model").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Computed Style").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Classes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Attributes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Siblings").length).toBeGreaterThan(0);
  });

  it("displays the source confidence badge", () => {
    render(<InspectorPanel summary={makeSummary()} onSelectElement={vi.fn()} />);

    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
  });

  it("renders the breadcrumb and calls onSelectElement when clicked", () => {
    const onSelect = vi.fn();
    render(<InspectorPanel summary={makeSummary()} onSelectElement={onSelect} />);

    const bodyButtons = screen.getAllByRole("button", { name: /body/i });
    bodyButtons[0]?.click();

    expect(onSelect).toHaveBeenCalledWith("body");
  });
});
