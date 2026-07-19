import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";
import { createPlan } from "./verification-plan.js";
import {
  fakePlanTarget,
  PLAN_OPERATION_BASE,
  planRef,
  planTargetWithGroup,
} from "./verification-plan.test-fixtures.js";

describe("createPlan structural assertions", () => {
  it("maps group reorder to first-child sibling position", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "group-reorder",
      parent: planRef("parent"),
      children: [planRef("a"), planRef("b"), planRef("c")],
      previousOrder: [0, 1, 2],
      newOrder: [2, 0, 1],
    } satisfies Extract<Operation, { kind: "group-reorder" }>;
    const assertion = createPlan(operation, { selector: "#parent" }).assertions[0];
    expect(assertion?.name).toBe("group-reorder:first-child-position");
    expect(assertion?.run(fakePlanTarget()).name).toBe("sibling-order");
  });

  it("maps group reparent to parent assertion", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "group-reparent",
      elements: [planRef("a"), planRef("b")],
      sourceParent: planRef("old"),
      sourceIndices: [0, 1],
      targetParent: { runtimeId: "new", selector: "#new-parent" },
      targetIndices: [0, 1],
    } satisfies Extract<Operation, { kind: "group-reparent" }>;
    const assertion = createPlan(operation, { selector: "#a" }).assertions[0];
    expect(assertion?.name).toBe("group-reparent:parent");
    expect(assertion?.run(fakePlanTarget()).name).toBe("parent");
  });

  it("passes multi-select composition when every target resolves", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "multi-select-group",
      targets: [planRef("a"), planRef("b"), planRef("c")],
      groupId: "g1",
    } satisfies Extract<Operation, { kind: "multi-select-group" }>;
    const target = planTargetWithGroup([
      { identity: "a", domIndex: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
      { identity: "b", domIndex: 1, rect: { x: 0, y: 0, width: 0, height: 0 } },
      { identity: "c", domIndex: 2, rect: { x: 0, y: 0, width: 0, height: 0 } },
    ]);
    const result = createPlan(operation, {}).assertions[0]?.run(target);
    expect(result?.passed).toBe(true);
    expect(result?.expected).toContain("3 target(s)");
    expect(result?.actual).toContain("3 target(s)");
  });

  it("fails multi-select composition when a target is missing", () => {
    const operation = {
      ...PLAN_OPERATION_BASE,
      kind: "multi-select-group",
      targets: [planRef("a"), planRef("b"), planRef("dropped")],
      groupId: "g1",
    } satisfies Extract<Operation, { kind: "multi-select-group" }>;
    const target = planTargetWithGroup([
      { identity: "a", domIndex: 0, rect: { x: 0, y: 0, width: 0, height: 0 } },
      { identity: "b", domIndex: 1, rect: { x: 0, y: 0, width: 0, height: 0 } },
    ]);
    const result = createPlan(operation, {}).assertions[0]?.run(target);
    expect(result?.passed).toBe(false);
    expect(result?.expected).toContain("3 target(s)");
    expect(result?.actual).toContain("2 target(s)");
  });
});
