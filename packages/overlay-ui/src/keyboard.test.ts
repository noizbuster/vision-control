import { describe, expect, it, vi } from "vitest";

import { createKeyboardController } from "./index.js";

describe("keyboard controller", () => {
  it("calls the matching callback for each handled key", () => {
    const callbacks = {
      onEscape: vi.fn(),
      onCycleChild: vi.fn(),
      onCycleParent: vi.fn(),
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

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(callbacks.onConfirm).toHaveBeenCalledTimes(1);

    controller.deactivate();
  });

  it("does not respond after deactivation", () => {
    const callbacks = {
      onEscape: vi.fn(),
      onCycleChild: vi.fn(),
      onCycleParent: vi.fn(),
      onConfirm: vi.fn(),
    };

    const controller = createKeyboardController(callbacks);
    controller.activate();
    controller.deactivate();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(callbacks.onEscape).not.toHaveBeenCalled();
  });
});
