import type { ElementRef, Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";
import type { VerificationDomAdapter } from "./dom-adapter.js";
import type { ResolvedTarget } from "./types.js";
import { createPlan } from "./verification-plan.js";

const ref = (runtimeId: string): ElementRef => ({ runtimeId });
const ID = "op-plan-test-0001";

function fakeTarget(): ResolvedTarget {
  const dom: VerificationDomAdapter = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getText: () => "hello",
    getClasses: () => ["text-sm"],
    getStyle: (_el, property) => (property === "color" ? "red" : "1rem"),
    getRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    getParent: () => null,
    getSiblingIndex: () => 2,
    getAttribute: () => null,
    isConnected: () => true,
    matchesSelector: () => false,
    computeFingerprint: () => "fp",
    getConsoleEntries: () => [],
  };
  return {
    element: {} as Element,
    dom,
    runtimeId: "rt-1",
    confidence: "high",
  };
}

describe("createPlan V1 assertions (VC-V1V2-16)", () => {
  it("grid-reorder dom-order -> sibling-order assertion", () => {
    const op: Extract<Operation, { kind: "grid-reorder" }> = {
      id: ID,
      kind: "grid-reorder",
      grid: ref("grid"),
      child: ref("child"),
      placement: "dom-order",
      fromIndex: 0,
      toIndex: 2,
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions).toHaveLength(1);
    expect(plan.assertions[0]?.name).toBe("grid-reorder:dom-order");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.name).toBe("sibling-order");
  });

  it("grid-reorder grid-area -> computed-style assertion on grid-row/column-start", () => {
    const op: Extract<Operation, { kind: "grid-reorder" }> = {
      id: ID,
      kind: "grid-reorder",
      grid: ref("grid"),
      child: ref("child"),
      placement: "grid-area",
      fromIndex: 0,
      toIndex: 0,
      newGridArea: "1 / 2 / 2 / 3",
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions).toHaveLength(1);
    expect(plan.assertions[0]?.name).toBe("grid-reorder:grid-area");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.expected).toContain("grid-row-start: 1");
    expect(result?.expected).toContain("grid-column-start: 2");
  });

  it("grid-reorder grid-area without newGridArea -> no assertions", () => {
    const op: Extract<Operation, { kind: "grid-reorder" }> = {
      id: ID,
      kind: "grid-reorder",
      grid: ref("grid"),
      child: ref("child"),
      placement: "grid-area",
      fromIndex: 0,
      toIndex: 0,
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions).toHaveLength(0);
  });

  it("grid-span column -> computed-style assertion on grid-column-end", () => {
    const op: Extract<Operation, { kind: "grid-span" }> = {
      id: ID,
      kind: "grid-span",
      grid: ref("grid"),
      child: ref("child"),
      axis: "column",
      fromSpan: 1,
      toSpan: 3,
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions).toHaveLength(1);
    expect(plan.assertions[0]?.name).toBe("grid-span:column");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.expected).toContain("grid-column-end: span 3");
  });

  it("grid-span row -> computed-style assertion on grid-row-end", () => {
    const op: Extract<Operation, { kind: "grid-span" }> = {
      id: ID,
      kind: "grid-span",
      grid: ref("grid"),
      child: ref("child"),
      axis: "row",
      fromSpan: 1,
      toSpan: 2,
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions[0]?.name).toBe("grid-span:row");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.expected).toContain("grid-row-end: span 2");
  });

  it("set-container-layout -> computed-style assertion", () => {
    const op: Extract<Operation, { kind: "set-container-layout" }> = {
      id: ID,
      kind: "set-container-layout",
      container: ref("container"),
      property: "gap",
      value: "1rem",
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#container" });
    expect(plan.assertions[0]?.name).toBe("set-container-layout:value");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.expected).toContain("gap: 1rem");
  });

  it("set-child-sizing with value -> computed-style assertion", () => {
    const op: Extract<Operation, { kind: "set-child-sizing" }> = {
      id: ID,
      kind: "set-child-sizing",
      container: ref("container"),
      childIndex: 0,
      child: ref("child"),
      sizing: "fixed",
      value: "120px",
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions[0]?.name).toBe("set-child-sizing:value");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.expected).toContain("width: 120px");
  });

  it("set-child-sizing without value -> context-dependent note", () => {
    const op: Extract<Operation, { kind: "set-child-sizing" }> = {
      id: ID,
      kind: "set-child-sizing",
      container: ref("container"),
      childIndex: 0,
      child: ref("child"),
      sizing: "fill",
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions[0]?.name).toBe("set-child-sizing:context-dependent");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.passed).toBe(true);
  });

  it("breakpoint-style-edit -> computed-style assertion", () => {
    const op: Extract<Operation, { kind: "breakpoint-style-edit" }> = {
      id: ID,
      kind: "breakpoint-style-edit",
      target: ref("target"),
      breakpoint: "md",
      property: "color",
      value: "blue",
      important: false,
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#target" });
    expect(plan.assertions[0]?.name).toBe("breakpoint-style-edit:value");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.expected).toContain("color: blue");
  });

  it("breakpoint-class-edit -> class assertion", () => {
    const op: Extract<Operation, { kind: "breakpoint-class-edit" }> = {
      id: ID,
      kind: "breakpoint-class-edit",
      target: ref("target"),
      breakpoint: "md",
      oldClassName: "text-sm",
      newClassName: "text-lg",
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#target" });
    expect(plan.assertions[0]?.name).toBe("breakpoint-class-edit");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.name).toBe("class");
  });

  it("breakpoint-text-edit -> text assertion", () => {
    const op: Extract<Operation, { kind: "breakpoint-text-edit" }> = {
      id: ID,
      kind: "breakpoint-text-edit",
      target: ref("target"),
      breakpoint: "md",
      newText: "Responsive label",
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#target" });
    expect(plan.assertions[0]?.name).toBe("breakpoint-text-edit:newText");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.name).toBe("text");
  });

  it("group-reorder -> sibling-order assertion", () => {
    const op: Extract<Operation, { kind: "group-reorder" }> = {
      id: ID,
      kind: "group-reorder",
      parent: ref("parent"),
      children: [ref("a"), ref("b"), ref("c")],
      previousOrder: [0, 1, 2],
      newOrder: [2, 0, 1],
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#parent" });
    expect(plan.assertions[0]?.name).toBe("group-reorder:first-child-position");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.name).toBe("sibling-order");
  });

  it("group-reparent -> parent assertion", () => {
    const op: Extract<Operation, { kind: "group-reparent" }> = {
      id: ID,
      kind: "group-reparent",
      elements: [ref("a"), ref("b")],
      sourceParent: ref("old"),
      sourceIndices: [0, 1],
      targetParent: { runtimeId: "new", selector: "#new-parent" },
      targetIndices: [0, 1],
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#a" });
    expect(plan.assertions[0]?.name).toBe("group-reparent:parent");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.name).toBe("parent");
  });

  it("align-elements -> structural reading-order note", () => {
    const op: Extract<Operation, { kind: "align-elements" }> = {
      id: ID,
      kind: "align-elements",
      targets: [ref("a"), ref("b")],
      alignment: "center",
      previousValues: ["0", "0"],
      newValues: ["10px", "10px"],
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#a" });
    expect(plan.assertions[0]?.name).toContain("align-elements:reading-order-pending");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.passed).toBe(true);
  });

  it("distribute-elements -> structural reading-order note", () => {
    const op: Extract<Operation, { kind: "distribute-elements" }> = {
      id: ID,
      kind: "distribute-elements",
      targets: [ref("a"), ref("b"), ref("c")],
      axis: "horizontal",
      mode: "space-between",
      previousGaps: ["4px", "4px"],
      newGaps: ["16px", "16px"],
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#a" });
    expect(plan.assertions[0]?.name).toContain("distribute-elements:reading-order-pending");
  });

  it("multi-select-group -> composition note", () => {
    const op: Extract<Operation, { kind: "multi-select-group" }> = {
      id: ID,
      kind: "multi-select-group",
      targets: [ref("a"), ref("b"), ref("c")],
      groupId: "g1",
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#a" });
    expect(plan.assertions[0]?.name).toBe("multi-select-group:composition");
    const result = plan.assertions[0]?.run(fakeTarget());
    expect(result?.passed).toBe(true);
    expect(result?.expected).toContain("3 target(s)");
  });

  it("screenshot-crop-ref -> no assertions (metadata only)", () => {
    const op: Extract<Operation, { kind: "screenshot-crop-ref" }> = {
      id: ID,
      kind: "screenshot-crop-ref",
      target: ref("target"),
      artifactId: "shot-1",
      captureRegion: { x: 0, y: 0, width: 100, height: 100 },
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
    };
    const plan = createPlan(op, { selector: "#target" });
    expect(plan.assertions).toHaveLength(0);
  });

  it("suggested-diff -> no assertions (inert data)", () => {
    const op: Extract<Operation, { kind: "suggested-diff" }> = {
      id: ID,
      kind: "suggested-diff",
      diff: "-a\n+b",
      sourceRanges: [],
      confidence: "high",
      preconditions: ["verify after HMR"],
      applied: false,
      timestamp: 0,
      runtime: false,
      origin: "property-panel" as const,
    };
    const plan = createPlan(op, { selector: "#target" });
    expect(plan.assertions).toHaveLength(0);
  });
});
