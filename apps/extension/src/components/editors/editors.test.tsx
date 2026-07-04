import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PseudoStyleTargetSchema } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClassEditor,
  EditorToolbar,
  PseudoElementEditor,
  StyleEditor,
  TextEditor,
} from "./index.js";

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
    classList: [
      { name: "btn", source: "unknown" },
      { name: "primary", source: "unknown" },
    ],
    attributes: [{ name: "id", value: "submit" }],
    semantic: {
      tagName: "button",
      role: "button",
      name: "Submit",
      textContentPreview: "Submit",
    },
    siblingSummary: {
      count: 1,
      index: 0,
      parentTagName: "form",
    },
    parentLayout: {
      mode: "block",
      display: "block",
    },
    sourceConfidence: "high",
  };
}

describe("EditorToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("activates a mode when a button is clicked", () => {
    const onChange = vi.fn();
    render(<EditorToolbar activeMode={null} onChangeMode={onChange} />);

    screen.getByRole("button", { name: "Edit Classes" }).click();
    expect(onChange).toHaveBeenCalledWith("class");
  });

  it("deactivates the current mode when its button is clicked", () => {
    const onChange = vi.fn();
    render(<EditorToolbar activeMode="style" onChangeMode={onChange} />);

    screen.getByRole("button", { name: "Edit Style" }).click();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("switches to an interaction mode when its button is clicked (PRD §8.3)", () => {
    const onChange = vi.fn();
    render(<EditorToolbar activeMode={null} onChangeMode={onChange} />);

    screen.getByRole("button", { name: "Move" }).click();
    expect(onChange).toHaveBeenCalledWith("Move");
  });

  it("toggles off an active interaction mode", () => {
    const onChange = vi.fn();
    render(<EditorToolbar activeMode="Resize" onChangeMode={onChange} />);

    screen.getByRole("button", { name: "Resize" }).click();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders all five interaction mode buttons", () => {
    render(<EditorToolbar activeMode={null} onChangeMode={vi.fn()} />);

    for (const label of ["Inspect", "Move", "Resize", "Text", "Layout"]) {
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
  });
});

describe("StyleEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("creates a StyleEditCommand on blur with a valid value", () => {
    const onCommand = vi.fn();
    const onValidationError = vi.fn();
    render(
      <StyleEditor
        summary={makeSummary()}
        onCommand={onCommand}
        onValidationError={onValidationError}
      />,
    );

    const paddingInput = screen.getAllByDisplayValue("8px")[0];
    if (paddingInput === undefined) {
      throw new Error("padding input not found");
    }
    fireEvent.change(paddingInput, { target: { value: "16px" } });
    fireEvent.blur(paddingInput);

    expect(onCommand).toHaveBeenCalledOnce();
    const command = onCommand.mock.calls[0]?.[0];
    expect(command.kind).toBe("style-edit");
    expect(command.property).toBe("padding");
    expect(command.value).toBe("16px");
    expect(command.previousValue).toBe("8px");
    expect(command.runtime).toBe(false);
    expect(onValidationError).toHaveBeenLastCalledWith(null);
  });

  it("creates a StyleEditCommand on Enter with a valid value", () => {
    const onCommand = vi.fn();
    const onValidationError = vi.fn();
    render(
      <StyleEditor
        summary={makeSummary()}
        onCommand={onCommand}
        onValidationError={onValidationError}
      />,
    );

    const colorInput = screen.getByDisplayValue("rgb(0, 0, 0)");
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    fireEvent.keyDown(colorInput, { key: "Enter", code: "Enter" });

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0].property).toBe("color");
    expect(onCommand.mock.calls[0]?.[0].value).toBe("#ff0000");
  });

  it("does NOT create a command for an invalid CSS value", () => {
    const onCommand = vi.fn();
    const onValidationError = vi.fn();
    render(
      <StyleEditor
        summary={makeSummary()}
        onCommand={onCommand}
        onValidationError={onValidationError}
      />,
    );

    const paddingInput = screen.getAllByDisplayValue("8px")[0];
    if (paddingInput === undefined) {
      throw new Error("padding input not found");
    }
    fireEvent.change(paddingInput, { target: { value: "abc" } });
    fireEvent.blur(paddingInput);

    expect(onCommand).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenLastCalledWith(
      expect.stringContaining("not a valid length"),
    );
  });

  it("does NOT create a command for an unknown property", () => {
    const onCommand = vi.fn();
    const onValidationError = vi.fn();
    render(
      <StyleEditor
        summary={makeSummary()}
        onCommand={onCommand}
        onValidationError={onValidationError}
      />,
    );

    const displayInput = screen.getByDisplayValue("inline-block");
    fireEvent.change(displayInput, { target: { value: "blocky" } });
    fireEvent.blur(displayInput);

    expect(onCommand).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenLastCalledWith(
      expect.stringContaining("not a valid display"),
    );
  });
});

describe("ClassEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("creates a ClassAddCommand when a class is added", () => {
    const onCommand = vi.fn();
    render(<ClassEditor summary={makeSummary()} onCommand={onCommand} />);

    const input = screen.getByPlaceholderText("Add a class…");
    fireEvent.change(input, { target: { value: "btn-large" } });
    screen.getByRole("button", { name: "Add" }).click();

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0].kind).toBe("class-add");
    expect(onCommand.mock.calls[0]?.[0].className).toBe("btn-large");
  });

  it("creates a ClassRemoveCommand when a chip is removed", () => {
    const onCommand = vi.fn();
    render(<ClassEditor summary={makeSummary()} onCommand={onCommand} />);

    screen.getByRole("button", { name: "Remove class btn" }).click();

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0].kind).toBe("class-remove");
    expect(onCommand.mock.calls[0]?.[0].className).toBe("btn");
  });

  it("creates a ClassReplaceCommand when a chip is edited", async () => {
    const onCommand = vi.fn();
    render(<ClassEditor summary={makeSummary()} onCommand={onCommand} />);

    screen.getByRole("button", { name: "btn" }).click();

    await waitFor(() => {
      expect(document.querySelector(".class-editor__chip-input")).not.toBeNull();
    });

    const input = document.querySelector(".class-editor__chip-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "button" } });
    fireEvent.blur(input);

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0].kind).toBe("class-replace");
    expect(onCommand.mock.calls[0]?.[0].oldClassName).toBe("btn");
    expect(onCommand.mock.calls[0]?.[0].newClassName).toBe("button");
  });
});

function getTextEditorInput(): HTMLInputElement | null {
  const host = document.querySelector("[data-vc-text-editor-host]") as HTMLElement | null;
  return (host?.shadowRoot?.querySelector(".vc-text-editor__input") as HTMLInputElement) ?? null;
}

describe("TextEditor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("creates a TextEditCommand on blur when text changes", () => {
    const onCommand = vi.fn();
    const onClose = vi.fn();
    render(<TextEditor summary={makeSummary()} onCommand={onCommand} onClose={onClose} />);

    const input = getTextEditorInput();
    expect(input).not.toBeNull();
    if (input === null) {
      throw new Error("Text editor input not found");
    }

    fireEvent.change(input, { target: { value: "Send" } });
    fireEvent.blur(input);

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0].kind).toBe("text-edit");
    expect(onCommand.mock.calls[0]?.[0].newText).toBe("Send");
    expect(onCommand.mock.calls[0]?.[0].previousText).toBe("Submit");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT create a command when text is unchanged", () => {
    const onCommand = vi.fn();
    const onClose = vi.fn();
    render(<TextEditor summary={makeSummary()} onCommand={onCommand} onClose={onClose} />);

    const input = getTextEditorInput();
    if (input === null) {
      throw new Error("Text editor input not found");
    }
    fireEvent.blur(input);

    expect(onCommand).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders the input inside a Shadow DOM host, isolated from the application DOM", () => {
    render(<TextEditor summary={makeSummary()} onCommand={vi.fn()} onClose={vi.fn()} />);

    const host = document.querySelector("[data-vc-text-editor-host]") as HTMLElement | null;
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();

    const input = getTextEditorInput();
    expect(input).not.toBeNull();
    expect(input?.closest("[data-vc-text-editor-host]")).toBeNull();
  });

  it("closes without committing on Escape", () => {
    const onCommand = vi.fn();
    const onClose = vi.fn();
    render(<TextEditor summary={makeSummary()} onCommand={onCommand} onClose={onClose} />);

    const input = getTextEditorInput();
    if (input === null) {
      throw new Error("Text editor input not found");
    }
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

    expect(onCommand).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("PseudoElementEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers exactly the whitelisted pseudo targets (::before/::after + 4 states)", () => {
    render(<PseudoElementEditor summary={makeSummary()} onCommand={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: /pseudo target/i }) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual([...PseudoStyleTargetSchema.options]);
  });

  it("emits a pseudo-style-edit op for ::before on Apply", () => {
    const onCommand = vi.fn();
    render(<PseudoElementEditor summary={makeSummary()} onCommand={onCommand} />);

    fireEvent.change(screen.getByRole("combobox", { name: /pseudo target/i }), {
      target: { value: "::before" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^property/i }), {
      target: { value: "content" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^value/i }), {
      target: { value: '"NEW"' },
    });
    screen.getByRole("button", { name: /apply/i }).click();

    expect(onCommand).toHaveBeenCalledOnce();
    const op = onCommand.mock.calls[0]?.[0];
    expect(op.kind).toBe("pseudo-style-edit");
    expect(op.pseudoTarget).toBe("::before");
    expect(op.property).toBe("content");
    expect(op.value).toBe('"NEW"');
    expect(op.target.runtimeId).toBe("runtime-1");
    expect(op.runtime).toBe(false);
    expect(op.origin).toBe("property-panel");
  });

  it("does NOT emit when the property is empty", () => {
    const onCommand = vi.fn();
    render(<PseudoElementEditor summary={makeSummary()} onCommand={onCommand} />);

    fireEvent.change(screen.getByRole("textbox", { name: /^property/i }), {
      target: { value: "  " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^value/i }), {
      target: { value: "red" },
    });
    screen.getByRole("button", { name: /apply/i }).click();

    expect(onCommand).not.toHaveBeenCalled();
  });

  it("emits a :hover state edit and the op parses against the change-ir schema", () => {
    const onCommand = vi.fn();
    render(<PseudoElementEditor summary={makeSummary()} onCommand={onCommand} />);

    fireEvent.change(screen.getByRole("combobox", { name: /pseudo target/i }), {
      target: { value: ":hover" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^property/i }), {
      target: { value: "color" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^value/i }), {
      target: { value: "blue" },
    });
    screen.getByRole("button", { name: /apply/i }).click();

    expect(onCommand).toHaveBeenCalledOnce();
    const op = onCommand.mock.calls[0]?.[0];
    expect(op.kind).toBe("pseudo-style-edit");
    expect(op.pseudoTarget).toBe(":hover");
    // Re-parse through the closed-kind schema: a malformed target would throw.
    expect(() => PseudoStyleTargetSchema.parse(op.pseudoTarget)).not.toThrow();
  });

  it("commits on Enter from the value input", () => {
    const onCommand = vi.fn();
    render(<PseudoElementEditor summary={makeSummary()} onCommand={onCommand} />);

    fireEvent.change(screen.getByRole("textbox", { name: /^property/i }), {
      target: { value: "color" },
    });
    const valueInput = screen.getByRole("textbox", { name: /^value/i });
    fireEvent.change(valueInput, { target: { value: "red" } });
    fireEvent.keyDown(valueInput, { key: "Enter", code: "Enter" });

    expect(onCommand).toHaveBeenCalledOnce();
  });
});
