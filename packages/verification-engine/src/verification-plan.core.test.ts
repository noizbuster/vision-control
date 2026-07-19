import { beforeEach, describe, expect, it } from "vitest";

import {
  elementRef,
  makeClassAdd,
  makeReorder,
  makeResize,
  makeStyleEdit,
  makeTextEdit,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import { createPlan } from "./verification-plan.js";

describe("createPlan core assertions", () => {
  beforeEach(() => resetOpCounter());

  it("generates computed-style assertion for style-edit", () => {
    const plan = createPlan(makeStyleEdit(elementRef("rt-1"), "color", "red"), {
      selector: "#btn",
    });
    expect(plan.assertions).toHaveLength(1);
    expect(plan.assertions[0]?.name).toBe("style-edit:value");
  });

  it("generates text assertion for text-edit", () => {
    const plan = createPlan(makeTextEdit(elementRef("rt-1"), "New Text"), {
      selector: "#btn",
    });
    expect(plan.assertions[0]?.name).toBe("text-edit:newText");
  });

  it("generates class-present assertion for class-add", () => {
    const plan = createPlan(makeClassAdd(elementRef("rt-1"), "active"), {
      selector: "#btn",
    });
    expect(plan.assertions[0]?.name).toBe("class-add");
  });

  it("generates sibling-order assertion for reorder-child", () => {
    const operation = makeReorder(elementRef("rt-parent"), elementRef("rt-child"), 0, 2);
    const plan = createPlan(operation, { selector: "#child" });
    expect(plan.assertions[0]?.name).toBe("reorder-child:toIndex");
  });

  it("generates computed-style assertion for resize-element", () => {
    const operation = makeResize(elementRef("rt-1"), "width", "100px", "200px", "px");
    const plan = createPlan(operation, { selector: "#el" });
    expect(plan.assertions[0]?.name).toBe("resize-element:value");
  });
});
