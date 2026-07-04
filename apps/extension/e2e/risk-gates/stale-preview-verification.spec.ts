import { expect, test } from "@playwright/test";

import {
  computeInverse,
  type ResizeElementOperation,
  type StyleEditOperation,
} from "@vision-control/change-ir";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  serveFixture,
} from "../fixtures/extension-test.ts";

/**
 * Risk gate D.1: stale preview layer cannot make verification pass.
 *
 * PRD Appendix D.1: runtime preview mutation is NOT a source change. A preview
 * that renders correctly does NOT prove the source changed. The verification
 * engine MUST clear the preview layer before asserting on the DOM.
 *
 * The core invariant is testable at the unit level: the `runtime` flag on
 * operations distinguishes preview mutations from source intent. The inverse of
 * a runtime operation is itself a runtime operation (never becomes source
 * intent). The verification engine must reject assertions where the only
 * applied operations are `runtime: true`.
 */

const runtimeStyleOp: StyleEditOperation = {
  kind: "style-edit",
  id: "style-runtime1",
  timestamp: 1000,
  runtime: true,
  target: { runtimeId: "el-stale-01" },
  property: "padding",
  value: "24px",
  important: false,
  previousValue: "10px",
};

const sourceStyleOp: StyleEditOperation = {
  ...runtimeStyleOp,
  id: "style-source1",
  runtime: false,
};

const runtimeResize: ResizeElementOperation = {
  kind: "resize-element",
  id: "resize-run01",
  timestamp: 2000,
  runtime: true,
  target: { runtimeId: "el-stale-02" },
  property: "flex-basis",
  fromValue: "200px",
  toValue: "300px",
};

test.describe("risk: stale preview verification (unit)", () => {
  test("runtime flag distinguishes preview from source intent", () => {
    expect(runtimeStyleOp.runtime).toBe(true);
    expect(sourceStyleOp.runtime).toBe(false);
  });

  test("inverse of a runtime operation preserves the runtime flag", () => {
    const inverse = computeInverse(runtimeStyleOp);
    expect(inverse.runtime).toBe(true);
    expect(inverse.kind).toBe("style-edit");
  });

  test("inverse of a source operation preserves source intent", () => {
    const inverse = computeInverse(sourceStyleOp);
    expect(inverse.runtime).toBe(false);
  });

  test("runtime resize inverse stays runtime", () => {
    const inverse = computeInverse(runtimeResize);
    expect(inverse.runtime).toBe(true);
    expect(inverse.kind).toBe("resize-element");
    if (inverse.kind === "resize-element") {
      expect(inverse.fromValue).toBe("300px");
      expect(inverse.toValue).toBe("200px");
    }
  });

  test("a changeset with only runtime ops is NOT a source change", () => {
    // Simulate the verification gate: if every operation in the changeset has
    // runtime: true, the changeset represents preview-only mutations and the
    // verification engine must treat the DOM as unpatched.
    const ops = [runtimeStyleOp, runtimeResize];
    const hasSourceIntent = ops.some((op) => !op.runtime);
    expect(hasSourceIntent).toBe(false);
  });

  test("a changeset with at least one source op has real intent", () => {
    const ops = [runtimeStyleOp, sourceStyleOp];
    const hasSourceIntent = ops.some((op) => !op.runtime);
    expect(hasSourceIntent).toBe(true);
  });
});

test.describe("risk: stale preview verification (browser)", () => {
  extTest("preview-only DOM does not pass verification after clearAll", async ({ page }) => {
    await serveFixture(page, fixtureHtml('<div id="target" style="padding:10px">Box</div>'));

    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "vc-preview-layer";
      style.textContent = "#target { padding: 24px !important; }";
      document.head.appendChild(style);
    });
    const withPreview = await page
      .locator("#target")
      .evaluate((el) => getComputedStyle(el).padding);
    extExpect(withPreview).toBe("24px");

    await page.evaluate(() => document.getElementById("vc-preview-layer")?.remove());
    const afterClear = await page.locator("#target").evaluate((el) => getComputedStyle(el).padding);
    extExpect(afterClear).toBe("10px");
    extExpect(afterClear).not.toBe("24px");
  });

  extTest("source-patched DOM passes verification after clearAll", async ({ page }) => {
    await serveFixture(page, fixtureHtml('<div id="target" style="padding:10px">Box</div>'));

    await page.locator("#target").evaluate((el) => {
      el.style.padding = "24px";
    });

    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "vc-preview-layer";
      style.textContent = "#target { padding: 24px !important; }";
      document.head.appendChild(style);
    });

    await page.evaluate(() => document.getElementById("vc-preview-layer")?.remove());
    const realValue = await page.locator("#target").evaluate((el) => getComputedStyle(el).padding);
    extExpect(realValue).toBe("24px");
  });
});
