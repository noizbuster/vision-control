import { describe, expect, it, vi } from "vitest";

import { createKeyboardController } from "./index.js";

function makeCallbacks() {
  return {
    onEscape: vi.fn(),
    onCycleChild: vi.fn(),
    onCycleParent: vi.fn(),
    onCyclePreviousSibling: vi.fn(),
    onCycleNextSibling: vi.fn(),
    onConfirm: vi.fn(),
    onDuplicateIntent: vi.fn(),
    onModifierChange: vi.fn(),
  };
}

describe("keyboard controller", () => {
  it("calls the matching callback for each handled key", () => {
    const callbacks = {
      onEscape: vi.fn(),
      onCycleChild: vi.fn(),
      onCycleParent: vi.fn(),
      onCyclePreviousSibling: vi.fn(),
      onCycleNextSibling: vi.fn(),
      onConfirm: vi.fn(),
    };

    const controller = createKeyboardController(callbacks);
    controller.activate();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(callbacks.onEscape).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(callbacks.onCycleChild).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(callbacks.onCycleChild).toHaveBeenCalledTimes(2);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(callbacks.onCycleParent).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(callbacks.onCyclePreviousSibling).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(callbacks.onCycleNextSibling).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(callbacks.onConfirm).toHaveBeenCalledTimes(1);

    controller.deactivate();
  });

  it("does not respond after deactivation", () => {
    const callbacks = {
      onEscape: vi.fn(),
      onCycleChild: vi.fn(),
      onCycleParent: vi.fn(),
      onCyclePreviousSibling: vi.fn(),
      onCycleNextSibling: vi.fn(),
      onConfirm: vi.fn(),
    };

    const controller = createKeyboardController(callbacks);
    controller.activate();
    controller.deactivate();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(callbacks.onEscape).not.toHaveBeenCalled();
  });
});

describe("keyboard controller — PRD §8.3 interaction modes", () => {
  it("cycles parent when Alt is pressed in Inspect mode (PRD §8.3)", () => {
    const callbacks = makeCallbacks();
    const controller = createKeyboardController(callbacks);
    controller.activate();

    expect(controller.getMode()).toBe("Inspect");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));

    expect(callbacks.onCycleParent).toHaveBeenCalledTimes(1);

    controller.deactivate();
  });

  it("tracks Shift modifier state in Resize mode (PRD §8.3 aspect-lock)", () => {
    const callbacks = makeCallbacks();
    const controller = createKeyboardController(callbacks);
    controller.activate();
    controller.setMode("Resize");

    expect(controller.getMode()).toBe("Resize");
    expect(controller.getModifiers()).toEqual({ alt: false, shift: false, meta: false });

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }),
    );

    expect(controller.getModifiers().shift).toBe(true);
    expect(callbacks.onModifierChange).toHaveBeenCalledWith({
      alt: false,
      shift: true,
      meta: false,
    });

    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));

    expect(controller.getModifiers().shift).toBe(false);

    controller.deactivate();
  });

  it("signals duplicate intent when Alt is pressed in Move mode (PRD §8.3)", () => {
    const callbacks = makeCallbacks();
    const controller = createKeyboardController(callbacks);
    controller.activate();
    controller.setMode("Move");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", bubbles: true }));

    expect(callbacks.onDuplicateIntent).toHaveBeenCalledTimes(1);

    controller.deactivate();
  });

  it("clears via Escape in every mode (PRD §8.3)", () => {
    const callbacks = makeCallbacks();
    const controller = createKeyboardController(callbacks);
    controller.activate();

    for (const mode of ["Move", "Resize", "Text", "Layout", "Inspect"] as const) {
      callbacks.onEscape.mockClear();
      controller.setMode(mode);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(callbacks.onEscape).toHaveBeenCalledTimes(1);
    }

    controller.deactivate();
  });

  it("resets modifier state when switching modes", () => {
    const callbacks = makeCallbacks();
    const controller = createKeyboardController(callbacks);
    controller.activate();
    controller.setMode("Resize");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }),
    );
    expect(controller.getModifiers().shift).toBe(true);

    controller.setMode("Inspect");
    expect(controller.getModifiers()).toEqual({ alt: false, shift: false, meta: false });

    controller.deactivate();
  });

  it("tracks Cmd/Ctrl as meta for snap-disable in Move mode (PRD §8.3)", () => {
    const callbacks = makeCallbacks();
    const controller = createKeyboardController(callbacks);
    controller.activate();
    controller.setMode("Move");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Meta", metaKey: true, bubbles: true }),
    );
    expect(controller.getModifiers().meta).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta", bubbles: true }));
    expect(controller.getModifiers().meta).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Control", ctrlKey: true, bubbles: true }),
    );
    expect(controller.getModifiers().meta).toBe(true);

    controller.deactivate();
  });

  it("does not fire Inspect navigation keys in Move mode", () => {
    const callbacks = makeCallbacks();
    const controller = createKeyboardController(callbacks);
    controller.activate();
    controller.setMode("Move");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(callbacks.onCycleParent).not.toHaveBeenCalled();
    expect(callbacks.onCyclePreviousSibling).not.toHaveBeenCalled();
    expect(callbacks.onCycleNextSibling).not.toHaveBeenCalled();
    expect(callbacks.onConfirm).not.toHaveBeenCalled();

    controller.deactivate();
  });
});
