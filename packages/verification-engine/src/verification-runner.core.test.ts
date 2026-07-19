import { beforeEach, describe, expect, it } from "vitest";

import {
  elementRef,
  makeCleanPreviewClearer,
  makeStyleEdit,
  makeTextEdit,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import { assertGeometry } from "./assertions/geometry.js";
import { type ConsoleEntry, createBrowserVerificationDomAdapter } from "./dom-adapter.js";
import { createPlan } from "./verification-plan.js";
import { runVerification } from "./verification-runner.js";

describe("runVerification core", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("passes when style edit landed in source", async () => {
    document.body.innerHTML = "<div data-vc-source='src-1' id='el' style='color: red'>x</div>";
    const operation = makeStyleEdit(elementRef("rt-1"), "color", "rgb(255, 0, 0)");
    const report = await runVerification(createPlan(operation, { sourceId: "src-1" }), {
      dom: createBrowserVerificationDomAdapter({ captureConsole: false }),
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    expect(report.verdict).toBe("pass");
    expect(report.target).not.toBeNull();
  });

  it("passes when text edit landed", async () => {
    document.body.innerHTML = "<div data-vc-source='src-2'>Updated</div>";
    const operation = makeTextEdit(elementRef("rt-1"), "Updated");
    const report = await runVerification(createPlan(operation, { sourceId: "src-2" }), {
      dom: createBrowserVerificationDomAdapter({ captureConsole: false }),
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
    });
    expect(report.verdict).toBe("pass");
  });

  it("includes console-clean assertion when console entries are supplied", async () => {
    document.body.innerHTML = "<div data-vc-source='src-3' style='display: block'>x</div>";
    const operation = makeStyleEdit(elementRef("rt-1"), "display", "block");
    const consoleEntries: ConsoleEntry[] = [];
    const report = await runVerification(createPlan(operation, { sourceId: "src-3" }), {
      dom: createBrowserVerificationDomAdapter({ captureConsole: false }),
      previewEngine: makeCleanPreviewClearer(),
      skipHmrWait: true,
      consoleEntries,
    });
    expect(report.verdict).toBe("pass");
    expect(report.assertions.some((assertion) => assertion.name === "console-clean")).toBe(true);
  });

  it.each([
    [0.3, true],
    [5, false],
  ] as const)("checks geometry tolerance for offset %s", (offset, passed) => {
    document.body.innerHTML = "<div id='el' style='width:100px;height:50px'></div>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const element = document.querySelector("#el");
    if (element === null) throw new Error("test setup: #el not found");
    const actual = dom.getRect(element);
    const result = assertGeometry(
      { element, dom, runtimeId: "rt", confidence: "high" },
      { x: actual.x + offset, y: actual.y, width: actual.width, height: actual.height },
      1,
    );
    expect(result.passed).toBe(passed);
  });
});
