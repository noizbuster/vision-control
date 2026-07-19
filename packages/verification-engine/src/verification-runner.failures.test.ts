import { beforeEach, describe, expect, it } from "vitest";

import {
  elementRef,
  makeCleanPreviewClearer,
  makeReorder,
  makeStuckPreviewClearer,
  makeStyleEdit,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import { createBrowserVerificationDomAdapter } from "./dom-adapter.js";
import { waitForHmrComplete } from "./hmr-detector.js";
import { createPlan } from "./verification-plan.js";
import { runVerification } from "./verification-runner.js";

describe("runVerification failures", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("hard-fails when preview remains active", async () => {
    document.body.innerHTML = "<div data-vc-source='src-1' style='color: red'>x</div>";
    const operation = makeStyleEdit(elementRef("rt-1"), "color", "rgb(255, 0, 0)");
    const report = await runVerification(createPlan(operation, { sourceId: "src-1" }), {
      dom: createBrowserVerificationDomAdapter({ captureConsole: false }),
      previewEngine: makeStuckPreviewClearer(3),
      skipHmrWait: true,
    });
    const previewAssertion = report.assertions.find(
      (assertion) => assertion.name === "preview-cleared",
    );
    expect(report.verdict).toBe("fail");
    expect(previewAssertion?.passed).toBe(false);
    expect(previewAssertion?.message).toContain("anti-cheat");
    expect(report.retryContext).toContain("preview");
  });

  it("fails when a repeated reorder target resolves at the wrong index", async () => {
    document.body.innerHTML = `
      <ul>
        <li data-vc-source='li-src' id='item-0'>A</li>
        <li data-vc-source='li-src' id='item-1'>B</li>
        <li data-vc-source='li-src' id='item-2'>C</li>
      </ul>
    `;
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const item = document.querySelector("#item-0");
    if (item === null) throw new Error("test setup: #item-0 not found");
    const operation = makeReorder(elementRef("rt-parent"), elementRef("rt-child"), 0, 2);
    const plan = createPlan(operation, {
      sourceId: "li-src",
      fingerprint: dom.computeFingerprint(item),
    });
    const report = await runVerification(plan, {
      dom,
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    const orderAssertion = report.assertions.find(
      (assertion) => assertion.name === "reorder-child:toIndex",
    );
    expect(report.verdict).toBe("fail");
    expect(orderAssertion?.passed).toBe(false);
  });

  it("fails when target is absent after HMR", async () => {
    document.body.innerHTML = "<div id='unrelated'>x</div>";
    const operation = makeStyleEdit(elementRef("rt-1"), "color", "red");
    const report = await runVerification(createPlan(operation, { sourceId: "src-gone" }), {
      dom: createBrowserVerificationDomAdapter({ captureConsole: false }),
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    const resolved = report.assertions.find((assertion) => assertion.name === "target-resolved");
    expect(report.verdict).toBe("fail");
    expect(resolved?.passed).toBe(false);
    expect(report.target).toBeNull();
  });

  it("clears preview before failing a stale HMR timeout", async () => {
    document.body.innerHTML = "<div data-vc-source='src-stale' style='color: red'>x</div>";
    const events: string[] = [];
    const preview = {
      activeCount: 0,
      clearAll: () => events.push("clear"),
    };
    const operation = makeStyleEdit(elementRef("rt-1"), "color", "rgb(255, 0, 0)");
    const report = await runVerification(createPlan(operation, { sourceId: "src-stale" }), {
      dom: createBrowserVerificationDomAdapter({ captureConsole: false }),
      previewEngine: preview,
      hmrTimeout: 0,
    });
    expect(events).toEqual(["clear"]);
    expect(report.verdict).toBe("fail");
    expect(report.assertions.find((assertion) => assertion.name === "hmr-complete")?.passed).toBe(
      false,
    );
  });
});

describe("waitForHmrComplete", () => {
  it.each([
    [1000, 50, true],
    [10, 100, false],
  ] as const)("handles a %sms timeout with a %sms stability window", async (timeout, stabilityWindow, expected) => {
    let time = 0;
    const result = await waitForHmrComplete({
      timeout,
      stabilityWindow,
      now: () => time,
      sleep: async (milliseconds) => {
        time += milliseconds;
      },
    });
    expect(result).toBe(expected);
  });
});
