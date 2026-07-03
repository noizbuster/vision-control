import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type EditableProp, PropsPanel } from "./PropsPanel.js";

function makeSummary(): SelectionSummary {
  return {
    identity: {
      runtimeId: "btn-submit",
      tagName: "button",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#submit",
    },
    breadcrumb: [{ tagName: "body", selector: "body" }],
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
      padding: "8px",
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
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      content: { width: 100, height: 40 },
      position: { x: 0, y: 0 },
    },
    classList: [],
    attributes: [{ name: "id", value: "submit" }],
    semantic: {
      tagName: "button",
      role: "button",
      name: "Submit",
      textContentPreview: "Submit",
    },
    siblingSummary: { count: 1, index: 0, parentTagName: "form" },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
  };
}

const sizeProp: EditableProp = {
  name: "size",
  value: "md",
  kind: "component-prop",
  componentName: "Button",
  sourceRange: { startLine: 12, startColumn: 16, endLine: 12, endColumn: 18 },
};

const ariaProp: EditableProp = {
  name: "aria-label",
  value: "Save",
  kind: "dom-attribute",
};

afterEach(() => {
  cleanup();
});

describe("PropsPanel — component prop editing", () => {
  it("emits a set-component-prop with the source range when a size prop is edited", () => {
    const onCommand = vi.fn();
    render(<PropsPanel summary={makeSummary()} props={[sizeProp]} onCommand={onCommand} />);

    const input = screen.getByLabelText("Edit Button.size");
    fireEvent.change(input, { target: { value: "lg" } });
    fireEvent.blur(input);

    expect(onCommand).toHaveBeenCalledOnce();
    const command = onCommand.mock.calls[0]?.[0];
    expect(command.kind).toBe("set-component-prop");
    expect(command.componentName).toBe("Button");
    expect(command.propName).toBe("size");
    expect(command.value).toBe("lg");
    expect(command.previousValue).toBe("md");
    expect(command.sourceRange).toEqual(sizeProp.sourceRange);
    expect(command.runtime).toBe(false);
    expect(command.target.runtimeId).toBe("btn-submit");
  });

  it("emits a set-attribute for a DOM-attribute prop", () => {
    const onCommand = vi.fn();
    render(<PropsPanel summary={makeSummary()} props={[ariaProp]} onCommand={onCommand} />);

    const input = screen.getByLabelText("Edit aria-label");
    fireEvent.change(input, { target: { value: "Submit form" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onCommand).toHaveBeenCalledOnce();
    const command = onCommand.mock.calls[0]?.[0];
    expect(command.kind).toBe("set-attribute");
    expect(command.name).toBe("aria-label");
    expect(command.value).toBe("Submit form");
    expect(command.previousValue).toBe("Save");
  });

  it("does NOT emit a command when the value is unchanged", () => {
    const onCommand = vi.fn();
    render(<PropsPanel summary={makeSummary()} props={[sizeProp]} onCommand={onCommand} />);

    const input = screen.getByLabelText("Edit Button.size");
    fireEvent.blur(input);

    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe("PropsPanel — cross-boundary blocking (PRD §7.2)", () => {
  const crossBoundaryProp: EditableProp = {
    name: "variant",
    value: "primary",
    kind: "component-prop",
    componentName: "Button",
    sourceRange: { startLine: 8, startColumn: 10, endLine: 8, endColumn: 18 },
    ownershipContext: "cross-boundary",
    boundary: "server-to-client",
  };

  it("blocks a cross-boundary prop edit without opt-in (no command emitted)", () => {
    const onCommand = vi.fn();
    const onValidationError = vi.fn();
    render(
      <PropsPanel
        summary={makeSummary()}
        props={[crossBoundaryProp]}
        onCommand={onCommand}
        onValidationError={onValidationError}
      />,
    );

    const input = screen.getByLabelText("Edit Button.variant");
    fireEvent.change(input, { target: { value: "secondary" } });
    fireEvent.blur(input);

    expect(onCommand).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenCalled();
    expect(onValidationError.mock.calls.at(-1)?.[0]).toEqual(
      expect.stringContaining("without explicit opt-in"),
    );
  });

  it("emits the command when the cross-boundary opt-in is checked", () => {
    const onCommand = vi.fn();
    render(
      <PropsPanel summary={makeSummary()} props={[crossBoundaryProp]} onCommand={onCommand} />,
    );

    screen.getByLabelText("cross-boundary opt-in").click();

    const input = screen.getByLabelText("Edit Button.variant");
    fireEvent.change(input, { target: { value: "secondary" } });
    fireEvent.blur(input);

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0].kind).toBe("set-component-prop");
    expect(onCommand.mock.calls[0]?.[0].value).toBe("secondary");
  });
});

describe("PropsPanel — empty state", () => {
  it("renders an empty-state message when no props are editable", () => {
    render(<PropsPanel summary={makeSummary()} props={[]} onCommand={vi.fn()} />);
    expect(screen.getByText("No editable props for this element.")).toBeDefined();
  });
});
