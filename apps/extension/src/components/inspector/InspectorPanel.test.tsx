import { cleanup, render, screen } from "@testing-library/react";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorMode } from "../../hooks/useEditor.js";
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

function makeProps(
  overrides: {
    summary?: SelectionSummary | null;
    onSelectElement?: (selector: string) => void;
    editorMode?: EditorMode;
    onChangeEditorMode?: (mode: EditorMode) => void;
    onEditorCommand?: (command: unknown) => void;
    onValidationError?: (error: string | null) => void;
  } = {},
) {
  return {
    summary: "summary" in overrides ? overrides.summary : makeSummary(),
    onSelectElement: overrides.onSelectElement ?? vi.fn(),
    editorMode: overrides.editorMode ?? null,
    onChangeEditorMode: overrides.onChangeEditorMode ?? vi.fn(),
    onEditorCommand: overrides.onEditorCommand ?? vi.fn(),
    onValidationError: overrides.onValidationError ?? vi.fn(),
  };
}

describe("InspectorPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an empty state when summary is null", () => {
    render(<InspectorPanel {...makeProps({ summary: null })} />);

    expect(screen.getByText("Select an element to inspect.")).toBeDefined();
  });

  it("renders all summary sections", () => {
    render(<InspectorPanel {...makeProps()} />);

    expect(screen.getAllByText("Identity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Editors").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Breadcrumb").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Semantic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Box Model").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Computed Style").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Classes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Attributes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Siblings").length).toBeGreaterThan(0);
  });

  it("displays the source confidence badge", () => {
    render(<InspectorPanel {...makeProps()} />);

    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
  });

  it("renders the breadcrumb and calls onSelectElement when clicked", () => {
    const onSelect = vi.fn();
    render(<InspectorPanel {...makeProps({ onSelectElement: onSelect })} />);

    const bodyButtons = screen.getAllByRole("button", { name: /body/i });
    bodyButtons[0]?.click();

    expect(onSelect).toHaveBeenCalledWith("body");
  });

  it("toggles the style editor when the toolbar button is clicked", () => {
    const onChangeMode = vi.fn();
    render(
      <InspectorPanel {...makeProps({ editorMode: null, onChangeEditorMode: onChangeMode })} />,
    );

    const styleButton = screen.getByRole("button", { name: "Edit Style" });
    styleButton.click();

    expect(onChangeMode).toHaveBeenCalledWith("style");
  });

  it("renders the style editor when mode is style", () => {
    render(<InspectorPanel {...makeProps({ editorMode: "style" })} />);

    expect(screen.getByText(/Edit a value and press Enter/i)).toBeDefined();
  });

  it("renders the class editor when mode is class", () => {
    render(<InspectorPanel {...makeProps({ editorMode: "class" })} />);

    expect(screen.getByPlaceholderText("Add a class…")).toBeDefined();
  });

  it("renders the text editor when mode is text", () => {
    render(<InspectorPanel {...makeProps({ editorMode: "text" })} />);

    expect(document.querySelector("[data-vc-text-editor-host]")).not.toBeNull();
  });

  it("does not render the Alignment section when no alignmentPanel slot is passed (additive default)", () => {
    render(<InspectorPanel {...makeProps()} />);

    expect(screen.queryByText("Alignment")).toBeNull();
  });

  it("renders the Alignment section when an alignmentPanel slot is passed", () => {
    render(
      <InspectorPanel
        {...makeProps()}
        alignmentPanel={<div data-vc-alignment-panel>alignment slot</div>}
      />,
    );

    expect(screen.getByText("Alignment")).toBeDefined();
    expect(document.querySelector("[data-vc-alignment-panel]")).not.toBeNull();
  });
});
