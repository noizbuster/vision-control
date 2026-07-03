import { describe, expect, it } from "vitest";

import {
  AUTO_LAYOUT_ALIGN_CROSS,
  AUTO_LAYOUT_ALIGN_MAIN,
  AUTO_LAYOUT_COMMAND_KINDS,
  AUTO_LAYOUT_DIRECTIONS,
  AUTO_LAYOUT_WRAP,
  BOX_SIDES,
  CHILD_SIZING_INTENTS,
  isContainerLevelCommand,
  PADDING_MODES,
  type SetChildSizingCommand,
  type SetPaddingCommand,
} from "./auto-layout-commands.js";

describe("auto-layout-commands — vocabulary const tuples", () => {
  it("exposes all four flex-direction values", () => {
    expect(AUTO_LAYOUT_DIRECTIONS).toEqual(["row", "row-reverse", "column", "column-reverse"]);
  });

  it("exposes all six justify-content values", () => {
    expect(AUTO_LAYOUT_ALIGN_MAIN).toEqual([
      "flex-start",
      "center",
      "flex-end",
      "space-between",
      "space-around",
      "space-evenly",
    ]);
  });

  it("exposes all five align-items values", () => {
    expect(AUTO_LAYOUT_ALIGN_CROSS).toEqual([
      "flex-start",
      "center",
      "flex-end",
      "stretch",
      "baseline",
    ]);
  });

  it("exposes all three flex-wrap values", () => {
    expect(AUTO_LAYOUT_WRAP).toEqual(["nowrap", "wrap", "wrap-reverse"]);
  });

  it("exposes all four padding modes", () => {
    expect(PADDING_MODES).toEqual(["all", "horizontal", "vertical", "individual"]);
  });

  it("exposes all four box sides clockwise from top", () => {
    expect(BOX_SIDES).toEqual(["top", "right", "bottom", "left"]);
  });

  it("exposes hug/fill/fixed sizing intents", () => {
    expect(CHILD_SIZING_INTENTS).toEqual(["hug", "fill", "fixed"]);
  });
});

describe("auto-layout-commands — discriminated union", () => {
  it("has exactly 7 command kinds", () => {
    expect(AUTO_LAYOUT_COMMAND_KINDS).toHaveLength(7);
  });

  it("includes set-container-layout-aligned and set-child-sizing kinds", () => {
    expect(AUTO_LAYOUT_COMMAND_KINDS).toContain("set-direction");
    expect(AUTO_LAYOUT_COMMAND_KINDS).toContain("set-gap");
    expect(AUTO_LAYOUT_COMMAND_KINDS).toContain("set-padding");
    expect(AUTO_LAYOUT_COMMAND_KINDS).toContain("set-align-main");
    expect(AUTO_LAYOUT_COMMAND_KINDS).toContain("set-align-cross");
    expect(AUTO_LAYOUT_COMMAND_KINDS).toContain("set-wrap");
    expect(AUTO_LAYOUT_COMMAND_KINDS).toContain("set-child-sizing");
  });
});

describe("auto-layout-commands — isContainerLevelCommand", () => {
  it("returns true for container-level commands", () => {
    expect(isContainerLevelCommand({ kind: "set-direction", direction: "row" })).toBe(true);
    expect(isContainerLevelCommand({ kind: "set-gap", value: "1rem" })).toBe(true);
    expect(isContainerLevelCommand({ kind: "set-align-main", value: "center" })).toBe(true);
  });

  it("returns false for set-child-sizing", () => {
    const cmd: SetChildSizingCommand = {
      kind: "set-child-sizing",
      childIndex: 0,
      intent: "hug",
    };
    expect(isContainerLevelCommand(cmd)).toBe(false);
  });

  it("treats individual padding mode as container-level (it edits the container)", () => {
    const cmd: SetPaddingCommand = {
      kind: "set-padding",
      mode: "individual",
      value: "",
      sides: { top: "8px", left: "4px" },
    };
    expect(isContainerLevelCommand(cmd)).toBe(true);
  });
});
