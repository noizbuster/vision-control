import type { ResizeFlexPairOperation } from "@vision-control/change-ir";
import { beforeEach, describe, expect, it } from "vitest";

import {
  type FlexDomFixture,
  installFlexVerificationDom,
  makeFlexVerificationOperation,
  withNeighborIdentity,
} from "./__fixtures__/flex-verification.js";
import type { PreviewClearer, VerificationReport } from "./types.js";
import { createPlan } from "./verification-plan.js";
import { runVerification } from "./verification-runner.js";

const clearedPreview = (): PreviewClearer => ({ activeCount: 0, clearAll: () => undefined });

async function runFlex(
  operation: ResizeFlexPairOperation,
  fixture: FlexDomFixture,
  preview: PreviewClearer = clearedPreview(),
): Promise<VerificationReport> {
  const candidate = {
    selector: operation.target.selector,
    occurrence: operation.target.occurrence,
    fingerprint: operation.target.fingerprint,
    ...(operation.target.sourceId !== undefined ? { sourceId: operation.target.sourceId } : {}),
  };
  return runVerification(createPlan(operation, candidate), {
    dom: fixture.dom,
    previewEngine: preview,
    skipHmrWait: true,
  });
}

function expectNamedFailure(report: VerificationReport, name: string): void {
  expect(report.verdict).toBe("fail");
  expect(report.assertions.find((assertion) => assertion.name === name)?.passed).toBe(false);
}

describe("runVerification resize-flex-pair", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clears first and reacquires three replacement siblings by occurrence", async () => {
    const fixture = installFlexVerificationDom("stale");
    const events: string[] = [];
    const dom = {
      ...fixture.dom,
      querySelectorAll: (selector: string) => {
        events.push(`query:${selector}`);
        return fixture.dom.querySelectorAll(selector);
      },
    };
    let cleared = false;
    const preview: PreviewClearer = {
      get activeCount() {
        return cleared ? 0 : 1;
      },
      clearAll: () => {
        events.push("clear");
        installFlexVerificationDom("new");
        cleared = true;
      },
    };
    const operation = makeFlexVerificationOperation();
    const report = await runFlex(operation, { ...fixture, dom }, preview);
    expect(report.verdict).toBe("pass");
    expect(report.target?.runtimeId).toBe("new-primary");
    expect(events[0]).toBe("clear");
    expect(
      report.assertions.find((assertion) => assertion.name === "preview-cleared")?.passed,
    ).toBe(true);
  });

  it("requires optional source ids on the same occurrence-selected elements", async () => {
    const fixture = installFlexVerificationDom();
    const report = await runFlex(makeFlexVerificationOperation(), fixture);
    expect(report.verdict).toBe("pass");
    expect(report.target?.sourceId).toBe("primary-src");
  });

  it.each([
    ["primary-only patch", "primary", "flex-grow:0;flex-shrink:0;flex-basis:200px"],
    ["neighbor-only patch", "neighbor", "flex-grow:0;flex-shrink:0;flex-basis:180px"],
    ["wrong primary grow", "primary", "flex-grow:1;flex-shrink:0;flex-basis:240px"],
    ["wrong neighbor shrink", "neighbor", "flex-grow:0;flex-shrink:1;flex-basis:140px"],
  ] as const)("fails a %s", async (_case, key, style) => {
    const fixture = installFlexVerificationDom();
    const element = key === "primary" ? fixture.primary : fixture.neighbor;
    element.setAttribute("style", `display:block;position:static;${style}`);
    expectNamedFailure(
      await runFlex(makeFlexVerificationOperation(), fixture),
      "resize-flex-pair:flex",
    );
  });

  it.each([
    ["zero selector matches", { selector: ".gone" }],
    ["out-of-range occurrence", { occurrence: 9 }],
    ["fingerprint mismatch", { fingerprint: "wrong-fp" }],
    ["source id mismatch", { sourceId: "wrong-src" }],
  ] as const)("fails identity for %s", async (_case, changes) => {
    const fixture = installFlexVerificationDom();
    const operation = withNeighborIdentity(makeFlexVerificationOperation(), changes);
    expectNamedFailure(await runFlex(operation, fixture), "resize-flex-pair:identity");
  });

  it("fails when both members resolve to the same node", async () => {
    const fixture = installFlexVerificationDom();
    const operation = makeFlexVerificationOperation();
    const sameNode = {
      ...operation,
      members: [
        operation.members[0],
        {
          ...operation.members[1],
          element: { ...operation.members[1].element, occurrence: 1, sourceId: "primary-src" },
        },
      ],
    } satisfies ResizeFlexPairOperation;
    expectNamedFailure(await runFlex(sameNode, fixture), "resize-flex-pair:structure");
  });

  it("fails exact-set equality when the third child is omitted", async () => {
    const fixture = installFlexVerificationDom();
    const operation = makeFlexVerificationOperation();
    const omitted = { ...operation, witnesses: [] } satisfies ResizeFlexPairOperation;
    expectNamedFailure(await runFlex(omitted, fixture), "resize-flex-pair:structure");
  });

  it("fails when duplicate witness identities resolve one element", async () => {
    const fixture = installFlexVerificationDom();
    const operation = makeFlexVerificationOperation();
    const witness = operation.witnesses[0];
    if (witness === undefined) throw new Error("test setup: witness missing");
    const duplicate = {
      ...operation,
      witnesses: [
        witness,
        {
          ...witness,
          element: { ...witness.element, selector: '[data-key="witness"]', occurrence: 0 },
        },
      ],
    } satisfies ResizeFlexPairOperation;
    expectNamedFailure(await runFlex(duplicate, fixture), "resize-flex-pair:structure");
  });

  it("fails when a witness is not a direct child", async () => {
    const fixture = installFlexVerificationDom();
    const nested = document.createElement("div");
    nested.className = "nested";
    nested.setAttribute("data-vc-source", "witness-src");
    fixture.witness.removeAttribute("data-vc-source");
    fixture.witness.append(nested);
    const operation = makeFlexVerificationOperation();
    const witness = operation.witnesses[0];
    if (witness === undefined) throw new Error("test setup: witness missing");
    const nonDirect = {
      ...operation,
      witnesses: [
        { ...witness, element: { ...witness.element, selector: ".nested", occurrence: 0 } },
      ],
    } satisfies ResizeFlexPairOperation;
    expectNamedFailure(await runFlex(nonDirect, fixture), "resize-flex-pair:structure");
  });

  it("fails when the container has non-whitespace direct text", async () => {
    const fixture = installFlexVerificationDom();
    fixture.container.append("anonymous flex item");
    expectNamedFailure(
      await runFlex(makeFlexVerificationOperation(), fixture),
      "resize-flex-pair:structure",
    );
  });

  it.each([
    [
      "primary used size",
      "primary",
      { x: 150, y: 20, width: 236, height: 80 },
      "resize-flex-pair:member-sizes",
    ],
    [
      "neighbor used size",
      "neighbor",
      { x: 10, y: 20, width: 136, height: 80 },
      "resize-flex-pair:member-sizes",
    ],
    [
      "container geometry",
      "container",
      { x: 14, y: 20, width: 600, height: 80 },
      "resize-flex-pair:container-geometry",
    ],
    [
      "witness geometry",
      "witness",
      { x: 394, y: 20, width: 200, height: 80 },
      "resize-flex-pair:witness-geometry",
    ],
  ] as const)("fails wrong %s", async (_case, key, rect, assertion) => {
    const fixture = installFlexVerificationDom();
    fixture.setRect(fixture[key], rect);
    expectNamedFailure(await runFlex(makeFlexVerificationOperation(), fixture), assertion);
  });

  it("accepts all member, container, and witness geometry within 1px", async () => {
    const fixture = installFlexVerificationDom();
    fixture.setRect(fixture.primary, { x: 150, y: 20, width: 240.5, height: 80 });
    fixture.setRect(fixture.neighbor, { x: 10, y: 20, width: 139.5, height: 80 });
    fixture.setRect(fixture.container, { x: 10.75, y: 20, width: 600, height: 80 });
    fixture.setRect(fixture.witness, { x: 390.75, y: 20, width: 200, height: 80 });
    expect((await runFlex(makeFlexVerificationOperation(), fixture)).verdict).toBe("pass");
  });

  it("fails pair delta when operation semantics are inconsistent", async () => {
    const fixture = installFlexVerificationDom();
    const operation = {
      ...makeFlexVerificationOperation(),
      delta: 20,
    } satisfies ResizeFlexPairOperation;
    expectNamedFailure(await runFlex(operation, fixture), "resize-flex-pair:pair-geometry");
  });

  it("fails pair total when the recorded before and after totals diverge", async () => {
    const fixture = installFlexVerificationDom();
    const operation = makeFlexVerificationOperation();
    const wrongTotal = {
      ...operation,
      members: [
        operation.members[0],
        {
          ...operation.members[1],
          before: { ...operation.members[1].before, usedMainSize: 170 },
        },
      ],
    } satisfies ResizeFlexPairOperation;
    expectNamedFailure(await runFlex(wrongTotal, fixture), "resize-flex-pair:pair-geometry");
  });

  it("hard-fails before pair assertions when preview cannot clear", async () => {
    const fixture = installFlexVerificationDom();
    const preview: PreviewClearer = { activeCount: 1, clearAll: () => undefined };
    const report = await runFlex(makeFlexVerificationOperation(), fixture, preview);
    expectNamedFailure(report, "preview-cleared");
    expect(
      report.assertions.some((assertion) => assertion.name.startsWith("resize-flex-pair")),
    ).toBe(false);
  });
});
