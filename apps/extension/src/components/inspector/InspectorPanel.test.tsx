import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Operation } from "@vision-control/change-ir";
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
      parent: { runtimeId: "parent-1", tagName: "form", selector: "form" },
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
    onEditorCommand?: (command: Operation) => void;
    onValidationError?: (error: string | null) => void;
    canCopySelectionContext?: boolean;
    onCopySelectionContext?: () => void;
    selectionCopyStatus?: "idle" | "resolving" | "copied" | "error";
  } = {},
) {
  return {
    summary: "summary" in overrides ? overrides.summary : makeSummary(),
    onSelectElement: overrides.onSelectElement ?? vi.fn(),
    editorMode: overrides.editorMode ?? null,
    onChangeEditorMode: overrides.onChangeEditorMode ?? vi.fn(),
    onEditorCommand: overrides.onEditorCommand ?? vi.fn(),
    onValidationError: overrides.onValidationError ?? vi.fn(),
    canCopySelectionContext: overrides.canCopySelectionContext ?? false,
    onCopySelectionContext: overrides.onCopySelectionContext ?? vi.fn(),
    selectionCopyStatus: overrides.selectionCopyStatus ?? "idle",
  };
}

describe("InspectorPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an empty state when summary is null", () => {
    render(<InspectorPanel {...makeProps({ summary: null })} />);

    expect(screen.getByText(/Select an element on the page to inspect/)).toBeDefined();
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

  it("places an accessible disabled copy action beside the selector while source hints resolve", () => {
    render(
      <InspectorPanel
        {...makeProps({ canCopySelectionContext: false, selectionCopyStatus: "resolving" })}
      />,
    );

    const selector = screen.getByTitle("#submit");
    const copyButton = screen.getByRole("button", { name: "Copy for agent" });
    const status = screen.getByTestId("selection-copy-status");

    expect(selector.closest(".inspector-semantic__row")?.contains(copyButton)).toBe(true);
    expect(copyButton).toHaveProperty("disabled", true);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Resolving source hints");
  });

  it("keeps the copy action disabled when source hints are unavailable", () => {
    render(<InspectorPanel {...makeProps({ canCopySelectionContext: false })} />);

    expect(screen.getByRole("button", { name: "Copy for agent" })).toHaveProperty("disabled", true);
  });

  it("enables the copy action and invokes its callback when context is ready", () => {
    const onCopySelectionContext = vi.fn();
    render(
      <InspectorPanel {...makeProps({ canCopySelectionContext: true, onCopySelectionContext })} />,
    );

    const copyButton = screen.getByRole("button", { name: "Copy for agent" });
    expect(copyButton).toHaveProperty("disabled", false);
    copyButton.click();

    expect(onCopySelectionContext).toHaveBeenCalledOnce();
  });

  it("announces copied and failed copy outcomes politely", () => {
    const { rerender } = render(
      <InspectorPanel {...makeProps({ selectionCopyStatus: "copied" })} />,
    );

    expect(screen.getByTestId("selection-copy-status").textContent).toBe(
      "Selection context copied",
    );

    rerender(<InspectorPanel {...makeProps({ selectionCopyStatus: "error" })} />);

    expect(screen.getByTestId("selection-copy-status").textContent).toBe("Copy failed");
  });

  it("copies the full selector from the identity section", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<InspectorPanel {...makeProps()} />);

    screen.getByRole("button", { name: "Copy selector" }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("#submit"));
    expect(screen.getByTestId("selector-copy-status").textContent).toBe("Selector copied");
  });

  it("ignores clipboard outcomes from an obsolete selector", async () => {
    let rejectFirstCopy: ((error: Error) => void) | undefined;
    const firstCopy = new Promise<void>((_resolve, reject) => {
      rejectFirstCopy = reject;
    });
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockReturnValueOnce(firstCopy)
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const firstSummary = makeSummary();
    const { rerender } = render(<InspectorPanel {...makeProps({ summary: firstSummary })} />);

    screen.getByRole("button", { name: "Copy selector" }).click();
    const secondSummary = {
      ...firstSummary,
      identity: { ...firstSummary.identity, selector: "#secondary-submit" },
    };
    rerender(<InspectorPanel {...makeProps({ summary: secondSummary })} />);
    screen.getByRole("button", { name: "Copy selector" }).click();
    await waitFor(() =>
      expect(screen.getByTestId("selector-copy-status").textContent).toBe("Selector copied"),
    );

    await act(async () => {
      rejectFirstCopy?.(new Error("obsolete clipboard failure"));
      await firstCopy.catch(() => undefined);
    });

    expect(screen.getByTestId("selector-copy-status").textContent).toBe("Selector copied");
  });

  it("shortens long selectors in the middle while retaining the full value", () => {
    const fullSelector = "main.content > section[data-view='settings'] > button.primary-action";
    const summary = makeSummary();
    render(
      <InspectorPanel
        {...makeProps({
          summary: {
            ...summary,
            identity: { ...summary.identity, selector: fullSelector },
          },
        })}
      />,
    );

    const selector = screen.getByTitle(fullSelector);
    expect(selector.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "main.content > s….primary-action",
    );
    expect(selector.getAttribute("title")).toBe(fullSelector);
  });

  it("does not split Unicode characters at the middle ellipsis", () => {
    const fullSelector = "123456789012345😀abcdefghijklmnopqrst";
    const summary = makeSummary();
    render(
      <InspectorPanel
        {...makeProps({
          summary: {
            ...summary,
            identity: { ...summary.identity, selector: fullSelector },
          },
        })}
      />,
    );

    expect(screen.getByTitle(fullSelector).querySelector("[aria-hidden='true']")?.textContent).toBe(
      "123456789012345😀…fghijklmnopqrst",
    );
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

  it("emits a remove-element command when Delete element is clicked", () => {
    const onEditorCommand = vi.fn<(command: Operation) => void>();
    render(<InspectorPanel {...makeProps({ onEditorCommand })} />);

    expect(screen.queryByText("Actions")).toBeNull();
    screen.getByRole("button", { name: "Delete element" }).click();

    expect(onEditorCommand).toHaveBeenCalledOnce();
    const command = onEditorCommand.mock.calls[0]?.[0];
    expect(command?.kind).toBe("remove-element");
    if (command?.kind !== "remove-element") return;
    expect(command.element.runtimeId).toBe("runtime-1");
    expect(command.parent.runtimeId).toBe("parent-1");
    expect(command.index).toBe(1);
    expect(command.tagName).toBe("button");
    expect(command.attributes).toEqual({ id: "submit", type: "submit" });
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
