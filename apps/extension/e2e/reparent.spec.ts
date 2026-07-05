import { expect, test } from "@playwright/test";

import { computeInverse, type ReparentElementOperation } from "@vision-control/change-ir";
import { validateReparent } from "@vision-control/layout-engine";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
  setInteractionMode,
} from "./fixtures/extension-test.ts";

/**
 * @reparent — AC-004 cross-container reparent.
 *
 * Unit tests verify content model validation + inverse computation. Browser
 * tests load the built extension, serve a real nested-DOM fixture, select real
 * elements via the overlay, and run `validateReparent` against REAL tag names
 * read from the live DOM — proving the content-model gate works against a real
 * browser DOM, not just synthetic strings.
 */

const reparentOp: ReparentElementOperation = {
  kind: "reparent-element",
  id: "reparent-001",
  timestamp: 1000,
  runtime: false,
  element: { runtimeId: "el-p01" },
  sourceParent: { runtimeId: "sidebar-p01" },
  sourceIndex: 0,
  targetParent: { runtimeId: "header-p01" },
  targetIndex: 1,
};

test.describe("@reparent unit", () => {
  test("reparent-element inverse swaps source and target parent/index", () => {
    const inverse = computeInverse(reparentOp);
    expect(inverse.kind).toBe("reparent-element");
    if (inverse.kind === "reparent-element") {
      expect(inverse.sourceParent.runtimeId).toBe("header-p01");
      expect(inverse.sourceIndex).toBe(1);
      expect(inverse.targetParent.runtimeId).toBe("sidebar-p01");
      expect(inverse.targetIndex).toBe(0);
    }
    expect(inverse.inverseOf).toBe("reparent-001");
  });

  test("invalid content model blocks reparent (div into ul)", () => {
    const result = validateReparent("ul", "div");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violation.code).toBe("INVALID_DROP_TARGET");
    }
  });

  test("valid content model allows reparent (div into section)", () => {
    const result = validateReparent("section", "div");
    expect(result.ok).toBe(true);
  });

  test("li can be reparented into ul (valid)", () => {
    const result = validateReparent("ul", "li");
    expect(result.ok).toBe(true);
  });

  test("runtime flag preserved on reparent inverse", () => {
    const previewReparent: ReparentElementOperation = {
      ...reparentOp,
      id: "reparent-pre",
      runtime: true,
    };
    expect(computeInverse(previewReparent).runtime).toBe(true);
  });

  test("reparent-element operation carries distinct source and target parents", () => {
    expect(reparentOp.kind).toBe("reparent-element");
    expect(reparentOp.sourceParent.runtimeId).not.toBe(reparentOp.targetParent.runtimeId);
    expect(reparentOp.sourceParent.runtimeId).toBe("sidebar-p01");
    expect(reparentOp.targetParent.runtimeId).toBe("header-p01");
  });

  test("reparent to a table ancestor is blocked for flow content", () => {
    const result = validateReparent("table", "div");
    expect(result.ok).toBe(false);
  });

  test("undo reparent moves element back to original parent and index via inverse", () => {
    const inverse = computeInverse(reparentOp);
    expect(inverse.kind).toBe("reparent-element");
    if (inverse.kind === "reparent-element") {
      expect(inverse.sourceParent.runtimeId).toBe("header-p01");
      expect(inverse.sourceIndex).toBe(1);
      expect(inverse.targetParent.runtimeId).toBe("sidebar-p01");
      expect(inverse.targetIndex).toBe(0);
    }
  });
});

const NESTED_FIXTURE = fixtureHtml(`
  <main>
    <header id="header"><h1>Title</h1></header>
    <section id="section"><p id="para">Text</p></section>
    <ul id="list"><li id="item">Item</li></ul>
  </main>
`);

const MOVE_REPARENT_FIXTURE = fixtureHtml(`
  <main id="canvas" style="width:720px;min-height:360px">
    <section id="source" style="display:flex;gap:24px;align-items:flex-start;width:520px;min-height:180px;padding:16px;border:1px solid #999">
      <div id="card" style="width:96px;height:48px;background:#f2f2f2;border:1px solid #333">Card</div>
      <div id="slot-shell" style="width:260px;height:140px;padding:16px;border:1px dashed #666">
        <section id="nested-target" style="display:grid;width:180px;min-height:96px;border:2px solid #0a7"></section>
      </div>
    </section>
    <section id="outside" style="margin-top:32px;width:180px;height:64px;border:1px solid #aaa">Outside</section>
  </main>
`);

test.describe("@reparent browser", () => {
  extTest(
    "real DOM tag names validate a valid reparent (p from section to header)",
    async ({ page }) => {
      await serveFixture(page, NESTED_FIXTURE);
      const tags = await page.evaluate(() => ({
        child: document.getElementById("para")?.tagName.toLowerCase() ?? "",
        sourceParent: document.getElementById("para")?.parentElement?.tagName.toLowerCase() ?? "",
        targetParent: document.getElementById("header")?.tagName.toLowerCase() ?? "",
      }));

      extExpect(tags.child).toBe("p");
      extExpect(tags.sourceParent).toBe("section");
      extExpect(tags.targetParent).toBe("header");

      const result = validateReparent(tags.targetParent, tags.child);
      extExpect(result.ok).toBe(true);
    },
  );

  extTest("real DOM tag names block an invalid reparent (div-child into ul)", async ({ page }) => {
    await serveFixture(
      page,
      fixtureHtml('<ul id="ul"><li id="li">A</li></ul><div id="div">D</div>'),
    );
    const tags = await page.evaluate(() => ({
      child: document.getElementById("div")?.tagName.toLowerCase() ?? "",
      targetParent: document.getElementById("ul")?.tagName.toLowerCase() ?? "",
    }));

    extExpect(tags.child).toBe("div");
    extExpect(tags.targetParent).toBe("ul");

    const result = validateReparent(tags.targetParent, tags.child);
    extExpect(result.ok).toBe(false);
    if (!result.ok) {
      extExpect(result.violation.code).toBe("INVALID_DROP_TARGET");
    }
  });

  extTest("real DOM tag names validate li into ul as a valid reparent", async ({ page }) => {
    await serveFixture(
      page,
      fixtureHtml('<ul id="ul-a"><li id="li-a">A</li></ul><ul id="ul-b"></ul>'),
    );
    const tags = await page.evaluate(() => ({
      child: document.getElementById("li-a")?.tagName.toLowerCase() ?? "",
      targetParent: document.getElementById("ul-b")?.tagName.toLowerCase() ?? "",
    }));

    extExpect(tags.child).toBe("li");
    extExpect(tags.targetParent).toBe("ul");

    const result = validateReparent(tags.targetParent, tags.child);
    extExpect(result.ok).toBe(true);
  });

  extTest("selecting the reparent candidate shows the overlay outline", async ({ page }) => {
    await serveFixture(page, NESTED_FIXTURE);
    const paraRect = await pageElementRect(page, "#para");
    await page.mouse.click(paraRect.x + 5, paraRect.y + 5);
    await page.waitForTimeout(800);

    const outline = await overlayElementInfo(page, ".vc-select-outline");
    extExpect(outline).not.toBeNull();
    if (outline === null) throw new Error("selection outline was not rendered");
    extExpect(Math.abs(outline.x - paraRect.x)).toBeLessThanOrEqual(3);
  });

  extTest(
    "Move reparent into a nested container persists after another click",
    async ({ page }) => {
      await serveFixture(page, MOVE_REPARENT_FIXTURE);
      const cardRect = await pageElementRect(page, "#card");
      await page.mouse.click(cardRect.x + 10, cardRect.y + 10);
      await page.waitForTimeout(400);
      await setInteractionMode(page, "Move");

      const targetRect = await pageElementRect(page, "#nested-target");
      await page.mouse.move(cardRect.x + cardRect.width / 2, cardRect.y + cardRect.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetRect.x + 40, targetRect.y + 40, { steps: 8 });
      await page.mouse.up();

      await extExpect(page.locator("#nested-target > #card")).toHaveCount(1);

      const outsideRect = await pageElementRect(page, "#outside");
      await page.mouse.click(outsideRect.x + 10, outsideRect.y + 10);
      await extExpect(page.locator("#nested-target > #card")).toHaveCount(1);
    },
  );
});
