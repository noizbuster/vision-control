import { describe, expect, it } from "vitest";

import { classifyLayoutRole, isNormalFlowRole, type LayoutComputedStyle } from "./index.js";

const style = (over: Partial<LayoutComputedStyle>): LayoutComputedStyle => ({
  display: "block",
  flexDirection: "",
  position: "static",
  ...over,
});

describe("classifyLayoutRole", () => {
  it("classifies flex containers by direction", () => {
    expect(classifyLayoutRole(style({ display: "flex", flexDirection: "row" }))).toBe("flex-row");
    expect(classifyLayoutRole(style({ display: "flex", flexDirection: "column" }))).toBe(
      "flex-column",
    );
    expect(classifyLayoutRole(style({ display: "flex", flexDirection: "row-reverse" }))).toBe(
      "flex-row",
    );
  });

  it("classifies block, inline, inline-block, grid, table-cell", () => {
    expect(classifyLayoutRole(style({ display: "block" }))).toBe("block");
    expect(classifyLayoutRole(style({ display: "list-item" }))).toBe("block");
    expect(classifyLayoutRole(style({ display: "inline" }))).toBe("inline");
    expect(classifyLayoutRole(style({ display: "inline-block" }))).toBe("inline-block");
    expect(classifyLayoutRole(style({ display: "grid" }))).toBe("grid");
    expect(classifyLayoutRole(style({ display: "table-cell" }))).toBe("table-cell");
  });

  it("position absolute/fixed/sticky take precedence over display", () => {
    expect(classifyLayoutRole(style({ display: "flex", position: "absolute" }))).toBe("absolute");
    expect(classifyLayoutRole(style({ display: "block", position: "fixed" }))).toBe("fixed");
    expect(classifyLayoutRole(style({ display: "block", position: "sticky" }))).toBe("sticky");
  });

  it("relative position is in-flow and falls through to display", () => {
    expect(classifyLayoutRole(style({ display: "flex", position: "relative" }))).toBe("flex-row");
  });

  it("unknown display classifies to unknown", () => {
    expect(classifyLayoutRole(style({ display: "contents" }))).toBe("unknown");
  });

  it("isNormalFlowRole excludes out-of-flow and unknown", () => {
    expect(isNormalFlowRole("block")).toBe(true);
    expect(isNormalFlowRole("flex-row")).toBe(true);
    expect(isNormalFlowRole("absolute")).toBe(false);
    expect(isNormalFlowRole("fixed")).toBe(false);
    expect(isNormalFlowRole("unknown")).toBe(false);
  });
});
