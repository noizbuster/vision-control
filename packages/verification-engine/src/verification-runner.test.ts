/**
 * Verification runner, plan generation, and HMR detector tests.
 *
 * Covers:
 *   - createPlan maps each operation kind to the right assertions.
 *   - runVerification happy path (pass).
 *   - Negative: preview not cleared → hard fail (anti-cheat).
 *   - Negative: wrong repeated instance → fail.
 *   - Geometry tolerance through the full runner.
 *   - waitForHmrComplete with injected clock/sleep.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  elementRef,
  makeClassAdd,
  makeCleanPreviewClearer,
  makeReorder,
  makeResize,
  makeStuckPreviewClearer,
  makeStyleEdit,
  makeTextEdit,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import {
  assertGeometry,
  type ConsoleEntry,
  createBrowserVerificationDomAdapter,
  createPlan,
  runVerification,
  type SourceCandidate,
  type VerificationDomAdapter,
  waitForHmrComplete,
} from "./index.js";

function makeDom(): VerificationDomAdapter {
  return createBrowserVerificationDomAdapter({ captureConsole: false });
}

describe("createPlan", () => {
  beforeEach(() => resetOpCounter());

  it("generates computed-style assertion for style-edit", () => {
    const op = makeStyleEdit(elementRef("rt-1"), "color", "red");
    const plan = createPlan(op, { selector: "#btn" });
    expect(plan.assertions).toHaveLength(1);
    expect(plan.assertions[0]?.name).toBe("style-edit:value");
  });

  it("generates text assertion for text-edit", () => {
    const op = makeTextEdit(elementRef("rt-1"), "New Text");
    const plan = createPlan(op, { selector: "#btn" });
    expect(plan.assertions[0]?.name).toBe("text-edit:newText");
  });

  it("generates class-present assertion for class-add", () => {
    const op = makeClassAdd(elementRef("rt-1"), "active");
    const plan = createPlan(op, { selector: "#btn" });
    expect(plan.assertions[0]?.name).toBe("class-add");
  });

  it("generates sibling-order assertion for reorder-child", () => {
    const op = makeReorder(elementRef("rt-parent"), elementRef("rt-child"), 0, 2);
    const plan = createPlan(op, { selector: "#child" });
    expect(plan.assertions[0]?.name).toBe("reorder-child:toIndex");
  });

  it("generates computed-style assertion for resize-element", () => {
    const op = makeResize(elementRef("rt-1"), "width", "100px", "200px", "px");
    const plan = createPlan(op, { selector: "#el" });
    expect(plan.assertions[0]?.name).toBe("resize-element:value");
  });
});

describe("runVerification — happy path", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("passes when style edit landed in source", async () => {
    document.body.innerHTML = "<div data-vc-source='src-1' id='el' style='color: red'>x</div>";
    const dom = makeDom();
    const op = makeStyleEdit(elementRef("rt-1"), "color", "rgb(255, 0, 0)");
    const candidate: SourceCandidate = { sourceId: "src-1" };
    const plan = createPlan(op, candidate);
    const report = await runVerification(plan, {
      dom,
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    expect(report.verdict).toBe("pass");
    expect(report.target).not.toBeNull();
  });

  it("passes when text edit landed", async () => {
    document.body.innerHTML = "<div data-vc-source='src-2' id='el'>Updated</div>";
    const dom = makeDom();
    const op = makeTextEdit(elementRef("rt-1"), "Updated");
    const plan = createPlan(op, { sourceId: "src-2" });
    const report = await runVerification(plan, {
      dom,
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    expect(report.verdict).toBe("pass");
  });

  it("includes console-clean assertion when consoleEntries provided", async () => {
    document.body.innerHTML = "<div data-vc-source='src-3' id='el'>x</div>";
    const dom = makeDom();
    const op = makeStyleEdit(elementRef("rt-1"), "display", "block");
    const plan = createPlan(op, { sourceId: "src-3" });
    const cleanConsole: ConsoleEntry[] = [];
    const report = await runVerification(plan, {
      dom,
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
      consoleEntries: cleanConsole,
    });
    expect(report.verdict).toBe("pass");
    expect(report.assertions.some((a) => a.name === "console-clean")).toBe(true);
  });
});

describe("runVerification — NEGATIVE: preview not cleared", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("hard-fails when preview layer still active (anti-cheat)", async () => {
    document.body.innerHTML = "<div data-vc-source='src-1' id='el' style='color: red'>x</div>";
    const dom = makeDom();
    const op = makeStyleEdit(elementRef("rt-1"), "color", "rgb(255, 0, 0)");
    const plan = createPlan(op, { sourceId: "src-1" });
    // clearAll is a no-op; activeCount stays > 0.
    const stuckClearer = makeStuckPreviewClearer(3);
    const report = await runVerification(plan, {
      dom,
      previewEngine: stuckClearer,
      skipHmrWait: true,
    });
    expect(report.verdict).toBe("fail");
    const previewAssertion = report.assertions.find((a) => a.name === "preview-cleared");
    expect(previewAssertion?.passed).toBe(false);
    expect(previewAssertion?.message).toContain("anti-cheat");
    expect(report.retryContext).toBeDefined();
    expect(report.retryContext).toContain("preview");
  });
});

describe("runVerification — NEGATIVE: wrong target reacquired", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("fails when reorder target is at wrong index (wrong instance picked)", async () => {
    // Three list items sharing a source id. The plan expects item at toIndex=2,
    // but the fingerprint resolves the FIRST instance (index 0). The
    // sibling-order assertion should fail because 0 !== 2.
    document.body.innerHTML = `
      <ul>
        <li data-vc-source='li-src' id='item-0'>A</li>
        <li data-vc-source='li-src' id='item-1'>B</li>
        <li data-vc-source='li-src' id='item-2'>C</li>
      </ul>
    `;
    const dom = makeDom();
    const item0 = document.querySelector("#item-0")!;
    const fp0 = dom.computeFingerprint(item0);

    const op = makeReorder(elementRef("rt-parent"), elementRef("rt-child"), 0, 2);
    const plan = createPlan(op, {
      sourceId: "li-src",
      fingerprint: fp0, // resolves item-0 which is at index 0, not 2
    });
    const report = await runVerification(plan, {
      dom,
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    expect(report.verdict).toBe("fail");
    const orderAssertion = report.assertions.find((a) => a.name === "reorder-child:toIndex");
    expect(orderAssertion?.passed).toBe(false);
  });

  it("fails when target element not found after HMR", async () => {
    document.body.innerHTML = "<div id='unrelated'>x</div>";
    const dom = makeDom();
    const op = makeStyleEdit(elementRef("rt-1"), "color", "red");
    const plan = createPlan(op, { sourceId: "src-gone" });
    const report = await runVerification(plan, {
      dom,
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    expect(report.verdict).toBe("fail");
    const resolveAssertion = report.assertions.find((a) => a.name === "target-resolved");
    expect(resolveAssertion?.passed).toBe(false);
    expect(report.target).toBeNull();
  });
});

describe("runVerification — geometry tolerance end-to-end", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("passes geometry within 1px tolerance through full runner", () => {
    document.body.innerHTML =
      "<div data-vc-source='geo' id='el' style='width:100px;height:50px'></div>";
    const dom = makeDom();
    const el = document.querySelector("#el")!;
    const actual = dom.getRect(el);
    const result = assertGeometry(
      { element: el, dom, runtimeId: "rt", confidence: "high" },
      { x: actual.x + 0.3, y: actual.y, width: actual.width, height: actual.height },
      1,
    );
    expect(result.passed).toBe(true);
  });

  it("fails geometry outside tolerance through full runner", () => {
    document.body.innerHTML =
      "<div data-vc-source='geo' id='el' style='width:100px;height:50px'></div>";
    const dom = makeDom();
    const el = document.querySelector("#el")!;
    const actual = dom.getRect(el);
    const result = assertGeometry(
      { element: el, dom, runtimeId: "rt", confidence: "high" },
      { x: actual.x + 5, y: actual.y, width: actual.width, height: actual.height },
      1,
    );
    expect(result.passed).toBe(false);
  });
});

describe("waitForHmrComplete", () => {
  it("returns true immediately when DOM is already stable (no mutations)", async () => {
    document.body.innerHTML = "<div>stable</div>";
    let time = 0;
    const result = await waitForHmrComplete({
      timeout: 1000,
      stabilityWindow: 50,
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    });
    expect(result).toBe(true);
  });

  it("returns false on timeout when DOM never stabilizes", async () => {
    document.body.innerHTML = "<div>flapping</div>";
    let time = 0;
    const result = await waitForHmrComplete({
      timeout: 10,
      stabilityWindow: 100,
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    });
    expect(result).toBe(false);
  });
});
