import { describe, expect, it } from "vitest";

import {
  buildAutoLayoutOperations,
  deriveAutoLayoutContainerContext,
  isFlexOrGridDisplay,
  toElementRefFromIdentity,
} from "./auto-layout-operations.js";

const CONTAINER_REF = { runtimeId: "runtime-flex-1", selector: "#container" };
const CHILD_REF = { runtimeId: "runtime-child-0" };

describe("deriveAutoLayoutContainerContext", () => {
  it("maps flex and inline-flex to flex-container", () => {
    expect(deriveAutoLayoutContainerContext("flex", "row").layoutRole).toBe("flex-container");
    expect(deriveAutoLayoutContainerContext("inline-flex", "column").layoutRole).toBe(
      "flex-container",
    );
  });

  it("maps grid and inline-grid to grid-container", () => {
    expect(deriveAutoLayoutContainerContext("grid", "row").layoutRole).toBe("grid-container");
    expect(deriveAutoLayoutContainerContext("inline-grid", "row").layoutRole).toBe(
      "grid-container",
    );
  });

  it("maps inline to unsupported layout roles", () => {
    expect(deriveAutoLayoutContainerContext("inline", "row").layoutRole).toBe("inline");
  });
});

describe("isFlexOrGridDisplay", () => {
  it("accepts flex/grid family displays", () => {
    expect(isFlexOrGridDisplay("flex")).toBe(true);
    expect(isFlexOrGridDisplay("inline-flex")).toBe(true);
    expect(isFlexOrGridDisplay("grid")).toBe(true);
    expect(isFlexOrGridDisplay("inline-grid")).toBe(true);
  });

  it("rejects block and inline", () => {
    expect(isFlexOrGridDisplay("block")).toBe(false);
    expect(isFlexOrGridDisplay("inline")).toBe(false);
  });
});

describe("toElementRefFromIdentity", () => {
  it("copies optional sourceId and selector when present", () => {
    expect(
      toElementRefFromIdentity({
        runtimeId: "r1",
        sourceId: "src",
        selector: "#x",
      }),
    ).toEqual({ runtimeId: "r1", sourceId: "src", selector: "#x" });
  });
});

describe("buildAutoLayoutOperations", () => {
  const flex = deriveAutoLayoutContainerContext("flex", "row");

  it("builds flex-direction op and propagates origin", () => {
    const result = buildAutoLayoutOperations({
      command: { kind: "set-direction", direction: "column" },
      container: flex,
      containerRef: CONTAINER_REF,
      origin: "canvas-drag",
      previousValues: { "flex-direction": "row" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0];
    expect(op?.kind).toBe("set-container-layout");
    if (op?.kind !== "set-container-layout") return;
    expect(op.property).toBe("flex-direction");
    expect(op.value).toBe("column");
    expect(op.origin).toBe("canvas-drag");
    expect(op.previousValue).toBe("row");
    expect(op.runtime).toBe(false);
    expect(op.container.runtimeId).toBe("runtime-flex-1");
  });

  it("builds gap op", () => {
    const result = buildAutoLayoutOperations({
      command: { kind: "set-gap", value: "12px" },
      container: flex,
      containerRef: CONTAINER_REF,
      origin: "property-panel",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.operations[0];
    if (op?.kind !== "set-container-layout") return;
    expect(op.property).toBe("gap");
    expect(op.value).toBe("12px");
    expect(op.origin).toBe("property-panel");
  });

  it("builds align-main and wrap ops", () => {
    const align = buildAutoLayoutOperations({
      command: { kind: "set-align-main", value: "center" },
      container: flex,
      containerRef: CONTAINER_REF,
      origin: "property-panel",
    });
    expect(align.ok).toBe(true);
    if (align.ok) {
      const op = align.operations[0];
      if (op?.kind === "set-container-layout") {
        expect(op.property).toBe("justify-content");
        expect(op.value).toBe("center");
      }
    }

    const wrap = buildAutoLayoutOperations({
      command: { kind: "set-wrap", value: "wrap" },
      container: flex,
      containerRef: CONTAINER_REF,
      origin: "canvas-drag",
    });
    expect(wrap.ok).toBe(true);
    if (wrap.ok) {
      const op = wrap.operations[0];
      if (op?.kind === "set-container-layout") {
        expect(op.property).toBe("flex-wrap");
        expect(op.value).toBe("wrap");
      }
    }
  });

  it("builds padding-all as a single container-layout op", () => {
    const result = buildAutoLayoutOperations({
      command: { kind: "set-padding", mode: "all", value: "8px" },
      container: flex,
      containerRef: CONTAINER_REF,
      origin: "property-panel",
      previousValues: { padding: "0px" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0];
    if (op?.kind !== "set-container-layout") return;
    expect(op.property).toBe("padding");
    expect(op.value).toBe("8px");
    expect(op.previousValue).toBe("0px");
  });

  it("fails for unsupported container", () => {
    const inline = deriveAutoLayoutContainerContext("inline", "row");
    const result = buildAutoLayoutOperations({
      command: { kind: "set-gap", value: "1rem" },
      container: inline,
      containerRef: CONTAINER_REF,
      origin: "property-panel",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/flex or grid/i);
  });

  it("builds child sizing hug with explicit childRef", () => {
    const result = buildAutoLayoutOperations({
      command: { kind: "set-child-sizing", childIndex: 0, intent: "hug" },
      container: flex,
      containerRef: CONTAINER_REF,
      childRef: CHILD_REF,
      origin: "canvas-drag",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.operations[0];
    expect(op?.kind).toBe("set-child-sizing");
    if (op?.kind !== "set-child-sizing") return;
    expect(op.sizing).toBe("hug");
    expect(op.child.runtimeId).toBe("runtime-child-0");
    expect(op.origin).toBe("canvas-drag");
    expect(op.value).toContain("flex");
  });

  it("builds child sizing fill and falls back child to containerRef", () => {
    const result = buildAutoLayoutOperations({
      command: { kind: "set-child-sizing", childIndex: 1, intent: "fill" },
      container: flex,
      containerRef: CONTAINER_REF,
      origin: "property-panel",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.operations[0];
    if (op?.kind !== "set-child-sizing") return;
    expect(op.sizing).toBe("fill");
    expect(op.child.runtimeId).toBe(CONTAINER_REF.runtimeId);
  });

  it("rejects empty gap", () => {
    const result = buildAutoLayoutOperations({
      command: { kind: "set-gap", value: "   " },
      container: flex,
      containerRef: CONTAINER_REF,
      origin: "property-panel",
    });
    expect(result.ok).toBe(false);
  });
});
