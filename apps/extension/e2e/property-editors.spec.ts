import { expect, test } from "@playwright/test";

import {
  createClassAddCommand,
  createStyleEditCommand,
  createTextEditCommand,
  validateCssProperty,
  validateCssValue,
} from "@vision-control/inspector-core";

/**
 * @property-editors — AC-002 style editing.
 *
 * Exercises the real command builders (inspector-core) and CSS validation
 * pipeline that the panel editors route through. Each test verifies the
 * operation payload shape and the CSS validation acceptance/rejection.
 */

const TARGET = { runtimeId: "el-edit-01", sourceId: "src-edit-01", selector: "#target" };

test.describe("@property-editors", () => {
  test("editing padding creates a style-edit operation with correct values", () => {
    const op = createStyleEditCommand(TARGET, "padding", "24px", "10px");
    expect(op.kind).toBe("style-edit");
    expect(op.property).toBe("padding");
    expect(op.value).toBe("24px");
    expect(op.previousValue).toBe("10px");
    expect(op.target.runtimeId).toBe("el-edit-01");
  });

  test("editing background-color creates a style-edit operation", () => {
    const op = createStyleEditCommand(TARGET, "background-color", "#ff0000", "transparent");
    expect(op.kind).toBe("style-edit");
    expect(op.property).toBe("background-color");
    expect(op.value).toBe("#ff0000");
  });

  test("adding a class creates a class-add operation", () => {
    const op = createClassAddCommand(TARGET, "highlight");
    expect(op.kind).toBe("class-add");
    expect(op.className).toBe("highlight");
    expect(op.target.runtimeId).toBe("el-edit-01");
  });

  test("editing text creates a text-edit operation", () => {
    const op = createTextEditCommand(TARGET, "World", "Hello");
    expect(op.kind).toBe("text-edit");
    expect(op.newText).toBe("World");
    expect(op.previousText).toBe("Hello");
  });

  test("invalid CSS value is rejected and no operation is valid", () => {
    const result = validateCssValue("padding", "abc");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.length).toBeGreaterThan(0);
    }
    const valid = validateCssValue("padding", "24px");
    expect(valid.valid).toBe(true);
  });

  test("invalid display value is rejected", () => {
    expect(validateCssValue("display", "blocky").valid).toBe(false);
    expect(validateCssValue("display", "block").valid).toBe(true);
    expect(validateCssValue("display", "flex").valid).toBe(true);
    expect(validateCssProperty("display")).toBe(true);
    expect(validateCssProperty("not-a-real-property")).toBe(false);
  });
});
