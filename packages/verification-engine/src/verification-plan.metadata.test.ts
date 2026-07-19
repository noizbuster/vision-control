import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";
import { createPlan } from "./verification-plan.js";
import { fakePlanTarget, PLAN_OPERATION_BASE, planRef } from "./verification-plan.test-fixtures.js";

describe("createPlan metadata assertions", () => {
  const breakpointStyle = {
    ...PLAN_OPERATION_BASE,
    kind: "breakpoint-style-edit",
    target: planRef("target"),
    breakpoint: "md",
    property: "color",
    value: "blue",
    important: false,
  } satisfies Extract<Operation, { kind: "breakpoint-style-edit" }>;
  const breakpointClass = {
    ...PLAN_OPERATION_BASE,
    kind: "breakpoint-class-edit",
    target: planRef("target"),
    breakpoint: "md",
    oldClassName: "text-sm",
    newClassName: "text-lg",
  } satisfies Extract<Operation, { kind: "breakpoint-class-edit" }>;
  const breakpointText = {
    ...PLAN_OPERATION_BASE,
    kind: "breakpoint-text-edit",
    target: planRef("target"),
    breakpoint: "md",
    newText: "Responsive label",
  } satisfies Extract<Operation, { kind: "breakpoint-text-edit" }>;

  it.each([
    [breakpointStyle, "breakpoint-style-edit:value", "computed-style", "color: blue"],
    [breakpointClass, "breakpoint-class-edit", "class", undefined],
    [breakpointText, "breakpoint-text-edit:newText", "text", undefined],
  ] as const)("maps a breakpoint edit", (operation, name, resultName, fragment) => {
    const assertion = createPlan(operation, {}).assertions[0];
    const result = assertion?.run(fakePlanTarget());
    expect(assertion?.name).toBe(name);
    expect(result?.name).toBe(resultName);
    if (fragment !== undefined) expect(result?.expected).toContain(fragment);
  });

  it("emits no assertion for screenshot metadata", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "screenshot-crop-ref",
      target: planRef("target"),
      artifactId: "shot-1",
      captureRegion: { x: 0, y: 0, width: 100, height: 100 },
    } satisfies Extract<Operation, { kind: "screenshot-crop-ref" }>;
    expect(createPlan(operation, {}).assertions).toHaveLength(0);
  });

  it("emits no assertion for inert suggested diffs", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "suggested-diff",
      diff: "-a\n+b",
      sourceRanges: [],
      confidence: "high",
      preconditions: ["verify after HMR"],
      applied: false,
    } satisfies Extract<Operation, { kind: "suggested-diff" }>;
    expect(createPlan(operation, {}).assertions).toHaveLength(0);
  });

  it("uses a context-dependent assertion for component props", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "set-component-prop",
      target: planRef("target"),
      componentName: "Button",
      propName: "size",
      value: "lg",
      previousValue: "md",
      sourceRange: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 2 },
    } satisfies Extract<Operation, { kind: "set-component-prop" }>;
    const assertion = createPlan(operation, {}).assertions[0];
    expect(assertion?.name).toBe("set-component-prop:context-dependent");
    expect(assertion?.run(fakePlanTarget()).passed).toBe(true);
    expect(assertion?.run(fakePlanTarget()).name).toContain("Button.size");
  });

  it.each([
    ["::before", "content", '"NEW"', "pseudo-style-edit:::before"],
    [":hover", "color", "blue", "pseudo-style-edit::hover"],
    ["::after", "color", "", "pseudo-style-edit:::after"],
  ] as const)("uses a context-dependent pseudo assertion for %s", (pseudoTarget, property, value, name) => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "pseudo-style-edit",
      target: planRef("target"),
      pseudoTarget,
      property,
      value,
      important: pseudoTarget === "::after",
    } satisfies Extract<Operation, { kind: "pseudo-style-edit" }>;
    const assertion = createPlan(operation, {}).assertions[0];
    expect(assertion?.name).toBe(name);
    expect(() => assertion?.run(fakePlanTarget())).not.toThrow();
    expect(assertion?.run(fakePlanTarget()).passed).toBe(true);
  });
});
