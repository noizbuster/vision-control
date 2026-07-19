import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";
import { createPlan } from "./verification-plan.js";
import {
  fakePlanTarget,
  PLAN_OPERATION_BASE,
  planRef,
  planTargetWithGroup,
} from "./verification-plan.test-fixtures.js";

describe("createPlan layout assertions", () => {
  const domOrder = {
    ...PLAN_OPERATION_BASE,
    kind: "grid-reorder",
    grid: planRef("grid"),
    child: planRef("child"),
    placement: "dom-order",
    fromIndex: 0,
    toIndex: 2,
  } satisfies Extract<Operation, { kind: "grid-reorder" }>;
  const gridArea = {
    ...domOrder,
    placement: "grid-area",
    toIndex: 0,
    newGridArea: "1 / 2 / 2 / 3",
  } satisfies Extract<Operation, { kind: "grid-reorder" }>;

  it.each([
    [domOrder, "grid-reorder:dom-order", "sibling-order", []],
    [
      gridArea,
      "grid-reorder:grid-area",
      "computed-style",
      ["grid-row-start: 1", "grid-column-start: 2"],
    ],
  ] as const)("maps grid-reorder to %s", (operation, name, resultName, fragments) => {
    const assertion = createPlan(operation, { selector: "#child" }).assertions[0];
    const result = assertion?.run(fakePlanTarget());
    expect(assertion?.name).toBe(name);
    expect(result?.name).toBe(resultName);
    for (const fragment of fragments) expect(result?.expected).toContain(fragment);
  });

  it("emits no assertion for grid-area without a new area", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "grid-reorder",
      grid: planRef("grid"),
      child: planRef("child"),
      placement: "grid-area",
      fromIndex: 0,
      toIndex: 0,
    } satisfies Extract<Operation, { kind: "grid-reorder" }>;
    expect(createPlan(operation, { selector: "#child" }).assertions).toHaveLength(0);
  });

  it.each([
    ["column", 3, "grid-column-end: span 3"],
    ["row", 2, "grid-row-end: span 2"],
  ] as const)("maps grid-span %s", (axis, toSpan, expected) => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "grid-span",
      grid: planRef("grid"),
      child: planRef("child"),
      axis,
      fromSpan: 1,
      toSpan,
    } satisfies Extract<Operation, { kind: "grid-span" }>;
    const result = createPlan(operation, { selector: "#child" }).assertions[0]?.run(
      fakePlanTarget(),
    );
    expect(result?.expected).toContain(expected);
  });

  const containerLayout = {
    ...PLAN_OPERATION_BASE,
    kind: "set-container-layout",
    container: planRef("container"),
    property: "gap",
    value: "1rem",
  } satisfies Extract<Operation, { kind: "set-container-layout" }>;
  const childSizing = {
    ...PLAN_OPERATION_BASE,
    kind: "set-child-sizing",
    container: planRef("container"),
    childIndex: 0,
    child: planRef("child"),
    sizing: "fixed",
    value: "120px",
  } satisfies Extract<Operation, { kind: "set-child-sizing" }>;

  it.each([
    [containerLayout, "gap: 1rem"],
    [childSizing, "width: 120px"],
  ] as const)("maps an explicit layout value", (operation, expected) => {
    const result = createPlan(operation, {}).assertions[0]?.run(fakePlanTarget());
    expect(result?.expected).toContain(expected);
  });

  it("uses a context-dependent assertion for implicit child sizing", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "set-child-sizing",
      container: planRef("container"),
      childIndex: 0,
      child: planRef("child"),
      sizing: "fill",
    } satisfies Extract<Operation, { kind: "set-child-sizing" }>;
    const assertion = createPlan(operation, {}).assertions[0];
    expect(assertion?.name).toBe("set-child-sizing:context-dependent");
    expect(assertion?.run(fakePlanTarget()).passed).toBe(true);
  });

  it("passes reading order when aligned targets agree", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "align-elements",
      targets: [planRef("a"), planRef("b"), planRef("c")],
      alignment: "center",
      previousValues: ["0", "0", "0"],
      newValues: ["10px", "10px", "10px"],
    } satisfies Extract<Operation, { kind: "align-elements" }>;
    const target = planTargetWithGroup([
      { identity: "a", domIndex: 0, rect: { x: 10, y: 0, width: 50, height: 20 } },
      { identity: "b", domIndex: 1, rect: { x: 10, y: 30, width: 50, height: 20 } },
      { identity: "c", domIndex: 2, rect: { x: 10, y: 60, width: 50, height: 20 } },
    ]);
    const assertion = createPlan(operation, {}).assertions[0];
    expect(assertion?.name).toBe("align-elements:reading-order");
    expect(assertion?.run(target).passed).toBe(true);
  });

  const alignmentOperation = {
    ...PLAN_OPERATION_BASE,
    kind: "align-elements",
    targets: [planRef("a"), planRef("missing")],
    alignment: "left",
    previousValues: ["0", "0"],
    newValues: ["0", "0"],
  } satisfies Extract<Operation, { kind: "align-elements" }>;
  const reversedAlignment = planTargetWithGroup([
    { identity: "a", domIndex: 0, rect: { x: 200, y: 0, width: 50, height: 20 } },
    { identity: "missing", domIndex: 1, rect: { x: 0, y: 0, width: 50, height: 20 } },
  ]);
  const missingAlignment = planTargetWithGroup([
    { identity: "a", domIndex: 0, rect: { x: 0, y: 0, width: 50, height: 20 } },
  ]);

  it.each([
    ["visual reversal", reversedAlignment, "reading-order-preserved", undefined],
    ["unresolved target", missingAlignment, "reading-order-preserved", "missing"],
  ] as const)("fails aligned reading order for %s", (_case, target, resultName, fragment) => {
    const result = createPlan(alignmentOperation, {}).assertions[0]?.run(target);
    expect(result?.passed).toBe(false);
    expect(result?.name).toBe(resultName);
    if (fragment !== undefined) expect(result?.actual).toContain(fragment);
  });

  const distributionOperation = {
    ...PLAN_OPERATION_BASE,
    kind: "distribute-elements",
    targets: [planRef("a"), planRef("b"), planRef("c")],
    axis: "horizontal",
    mode: "space-between",
    previousGaps: ["4px", "4px"],
    newGaps: ["16px", "16px"],
  } satisfies Extract<Operation, { kind: "distribute-elements" }>;
  const orderedDistribution = planTargetWithGroup([
    { identity: "a", domIndex: 0, rect: { x: 0, y: 0, width: 50, height: 20 } },
    { identity: "b", domIndex: 1, rect: { x: 100, y: 0, width: 50, height: 20 } },
    { identity: "c", domIndex: 2, rect: { x: 200, y: 0, width: 50, height: 20 } },
  ]);
  const reversedDistribution = planTargetWithGroup([
    { identity: "a", domIndex: 0, rect: { x: 200, y: 0, width: 50, height: 20 } },
    { identity: "b", domIndex: 1, rect: { x: 100, y: 0, width: 50, height: 20 } },
    { identity: "c", domIndex: 2, rect: { x: 0, y: 0, width: 50, height: 20 } },
  ]);

  it.each([
    ["ordered targets", orderedDistribution, true],
    ["visual reversal", reversedDistribution, false],
  ] as const)("checks distribution reading order for %s", (_case, target, passed) => {
    const assertion = createPlan(distributionOperation, {}).assertions[0];
    expect(assertion?.name).toBe("distribute-elements:reading-order");
    expect(assertion?.run(target).passed).toBe(passed);
  });
});
