import { describe, expect, it } from "vitest";

import {
  classifyLayoutRole,
  isFlexContainerRole,
  isGridRole,
  isNormalFlowRole,
  LAYOUT_ROLES,
  type LayoutComputedStyle,
} from "./index.js";

const style = (over: Partial<LayoutComputedStyle>): LayoutComputedStyle => ({
  display: "block",
  flexDirection: "",
  position: "static",
  ...over,
});

describe("LAYOUT_ROLES is the closed PRD §9.5 12-value set", () => {
  it("contains exactly the 12 PRD kinds with NO legacy names", () => {
    expect(LAYOUT_ROLES).toEqual([
      "normal-flow-block",
      "inline",
      "inline-block",
      "flex-container",
      "flex-item",
      "grid-container",
      "grid-item",
      "absolute-positioned",
      "fixed-positioned",
      "replaced-element",
      "svg-element",
      "unknown",
    ]);
  });
});

describe("classifyLayoutRole — replaced-element detection", () => {
  it("classifies <img>, <video>, <canvas> as replaced-element regardless of display", () => {
    expect(classifyLayoutRole(style({ tagName: "img" }))).toBe("replaced-element");
    expect(classifyLayoutRole(style({ tagName: "VIDEO", display: "block" }))).toBe(
      "replaced-element",
    );
    expect(classifyLayoutRole(style({ tagName: "canvas" }))).toBe("replaced-element");
  });

  it("a replaced element keeps its role even when positioned", () => {
    expect(classifyLayoutRole(style({ tagName: "img", position: "absolute" }))).toBe(
      "replaced-element",
    );
  });
});

describe("classifyLayoutRole — svg-element detection", () => {
  it("classifies <svg> and SVG children as svg-element", () => {
    expect(classifyLayoutRole(style({ tagName: "svg" }))).toBe("svg-element");
    expect(classifyLayoutRole(style({ tagName: "path" }))).toBe("svg-element");
    expect(classifyLayoutRole(style({ tagName: "circle" }))).toBe("svg-element");
    expect(classifyLayoutRole(style({ tagName: "rect", display: "block" }))).toBe("svg-element");
  });
});

describe("classifyLayoutRole — container vs item", () => {
  it("classifies a flex element as flex-container (direction not encoded in role)", () => {
    expect(classifyLayoutRole(style({ display: "flex", flexDirection: "row" }))).toBe(
      "flex-container",
    );
    expect(classifyLayoutRole(style({ display: "flex", flexDirection: "column" }))).toBe(
      "flex-container",
    );
    expect(classifyLayoutRole(style({ display: "inline-flex" }))).toBe("flex-container");
  });

  it("classifies a grid element as grid-container", () => {
    expect(classifyLayoutRole(style({ display: "grid" }))).toBe("grid-container");
    expect(classifyLayoutRole(style({ display: "inline-grid" }))).toBe("grid-container");
  });

  it("classifies a block child of a flex container as flex-item", () => {
    expect(classifyLayoutRole(style({ display: "block", parentDisplay: "flex" }))).toBe(
      "flex-item",
    );
  });

  it("classifies a block child of a grid container as grid-item", () => {
    expect(classifyLayoutRole(style({ display: "block", parentDisplay: "grid" }))).toBe(
      "grid-item",
    );
  });

  it("a flex container is NOT itself a flex-item even with a flex parent", () => {
    expect(classifyLayoutRole(style({ display: "flex", parentDisplay: "flex" }))).toBe(
      "flex-container",
    );
  });
});

describe("classifyLayoutRole — normal-flow block and inline", () => {
  it("classifies block, list-item, flow-root, table-cell as normal-flow-block", () => {
    expect(classifyLayoutRole(style({ display: "block" }))).toBe("normal-flow-block");
    expect(classifyLayoutRole(style({ display: "list-item" }))).toBe("normal-flow-block");
    expect(classifyLayoutRole(style({ display: "flow-root" }))).toBe("normal-flow-block");
    expect(classifyLayoutRole(style({ display: "table-cell" }))).toBe("normal-flow-block");
  });

  it("classifies inline and inline-block", () => {
    expect(classifyLayoutRole(style({ display: "inline" }))).toBe("inline");
    expect(classifyLayoutRole(style({ display: "inline-block" }))).toBe("inline-block");
  });
});

describe("classifyLayoutRole — position precedence", () => {
  it("absolute/fixed take precedence over display", () => {
    expect(classifyLayoutRole(style({ display: "flex", position: "absolute" }))).toBe(
      "absolute-positioned",
    );
    expect(classifyLayoutRole(style({ display: "block", position: "fixed" }))).toBe(
      "fixed-positioned",
    );
  });

  it("relative/sticky are in-flow and fall through to display classification", () => {
    expect(classifyLayoutRole(style({ display: "flex", position: "relative" }))).toBe(
      "flex-container",
    );
    expect(classifyLayoutRole(style({ display: "block", position: "sticky" }))).toBe(
      "normal-flow-block",
    );
  });
});

describe("classifyLayoutRole — unknown", () => {
  it("classifies unrecognized display values to unknown", () => {
    expect(classifyLayoutRole(style({ display: "contents" }))).toBe("unknown");
  });
});

describe("isNormalFlowRole", () => {
  it("includes normal-flow-block, inline, inline-block, containers, items, replaced, svg", () => {
    expect(isNormalFlowRole("normal-flow-block")).toBe(true);
    expect(isNormalFlowRole("inline")).toBe(true);
    expect(isNormalFlowRole("inline-block")).toBe(true);
    expect(isNormalFlowRole("flex-container")).toBe(true);
    expect(isNormalFlowRole("flex-item")).toBe(true);
    expect(isNormalFlowRole("grid-container")).toBe(true);
    expect(isNormalFlowRole("grid-item")).toBe(true);
    expect(isNormalFlowRole("replaced-element")).toBe(true);
    expect(isNormalFlowRole("svg-element")).toBe(true);
  });

  it("excludes absolute-positioned, fixed-positioned, and unknown", () => {
    expect(isNormalFlowRole("absolute-positioned")).toBe(false);
    expect(isNormalFlowRole("fixed-positioned")).toBe(false);
    expect(isNormalFlowRole("unknown")).toBe(false);
  });
});

describe("isFlexContainerRole", () => {
  it("is true only for flex-container", () => {
    expect(isFlexContainerRole("flex-container")).toBe(true);
    expect(isFlexContainerRole("flex-item")).toBe(false);
    expect(isFlexContainerRole("normal-flow-block")).toBe(false);
  });
});

describe("isGridRole", () => {
  it("is true for grid-container and grid-item", () => {
    expect(isGridRole("grid-container")).toBe(true);
    expect(isGridRole("grid-item")).toBe(true);
    expect(isGridRole("normal-flow-block")).toBe(false);
  });
});
