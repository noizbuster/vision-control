import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import { createBrowserVerificationDomAdapter } from "./dom-adapter.js";
import type { ResolvedTarget } from "./types.js";
import { createPlan } from "./verification-plan.js";

const reparentOperation: Extract<Operation, { kind: "reparent-element" }> = {
  id: "reparent-plan-test-0001",
  kind: "reparent-element",
  element: { runtimeId: "moved" },
  sourceParent: { runtimeId: "source" },
  sourceIndex: 0,
  targetParent: { runtimeId: "target", selector: "#expected-parent" },
  targetIndex: 1,
  timestamp: 0,
  runtime: false,
  origin: "canvas-drag",
  confidence: 1,
};

function targetFromHtml(html: string): ResolvedTarget {
  document.body.innerHTML = html;
  const element = document.querySelector("#moved");
  if (element === null) throw new Error("test setup: #moved not found");
  return {
    element,
    dom: createBrowserVerificationDomAdapter({ captureConsole: false }),
    runtimeId: "moved",
    confidence: "high",
  };
}

describe("createPlan reparent-element assertions", () => {
  it("returns independent parent and sibling-order assertions", () => {
    const plan = createPlan(reparentOperation, { selector: "#moved" });

    expect(plan.assertions.map(({ name }) => name)).toEqual([
      "reparent-element:parent",
      "reparent-element:targetIndex",
    ]);
  });

  it("fails only sibling order when the parent is correct but targetIndex is wrong", () => {
    const target = targetFromHtml(
      '<section id="expected-parent"><span id="moved"></span><span></span></section>',
    );
    const plan = createPlan(reparentOperation, { selector: "#moved" });

    const results = plan.assertions.map(({ run }) => run(target));

    expect(results.map(({ name, passed }) => ({ name, passed }))).toEqual([
      { name: "parent", passed: true },
      { name: "sibling-order", passed: false },
    ]);
  });

  it("fails only parent when targetIndex is correct but the parent is wrong", () => {
    const target = targetFromHtml(
      '<section id="wrong-parent"><span></span><span id="moved"></span></section>',
    );
    const plan = createPlan(reparentOperation, { selector: "#moved" });

    const results = plan.assertions.map(({ run }) => run(target));

    expect(results.map(({ name, passed }) => ({ name, passed }))).toEqual([
      { name: "parent", passed: false },
      { name: "sibling-order", passed: true },
    ]);
  });
});
