import { expect, test } from "@playwright/test";

import {
  appendOperation,
  type ChangeSet,
  type ClassAddOperation,
  computeInverse,
  createChangeSet,
  type StyleEditOperation,
  type TextEditOperation,
} from "@vision-control/change-ir";
import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  createJournal,
  createJournalEntry,
  deserializeJournal,
  redo,
  serializeJournal,
  undo,
} from "@vision-control/change-journal";

import {
  expect as extExpect,
  test as extTest,
  fixtureHtml,
  overlayElementInfo,
  pageElementRect,
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @journal-undo-redo — AC-002 undo/redo.
 *
 * Unit tests verify inverse computation, journal append/undo/redo, and
 * serialization round-trip without a browser. Browser tests load the built
 * extension, serve a real fixture, and exercise the real preview engine's
 * DOM mutations (style injection + rollback) — the visual contract the journal
 * undo/redo relies on.
 */

const ts = (n: number): number => n;

const styleOp: StyleEditOperation = {
  kind: "style-edit",
  id: "style-j001",
  timestamp: ts(1000),
  runtime: false,
  target: { runtimeId: "el-j001" },
  property: "padding",
  value: "24px",
  important: false,
  previousValue: "10px",
};

const textOp: TextEditOperation = {
  kind: "text-edit",
  id: "text-j001",
  timestamp: ts(2000),
  runtime: false,
  target: { runtimeId: "el-j001" },
  newText: "World",
  previousText: "Hello",
};

const classOp: ClassAddOperation = {
  kind: "class-add",
  id: "class-j001",
  timestamp: ts(3000),
  runtime: false,
  target: { runtimeId: "el-j001" },
  className: "highlight",
};

test.describe("@journal-undo-redo unit", () => {
  test("style-edit inverse swaps value and previousValue", () => {
    const inverse = computeInverse(styleOp);
    expect(inverse.kind).toBe("style-edit");
    if (inverse.kind === "style-edit") {
      expect(inverse.value).toBe("10px");
      expect(inverse.previousValue).toBe("24px");
    }
    expect(inverse.inverseOf).toBe(styleOp.id);
    expect(inverse.runtime).toBe(false);
  });

  test("text-edit inverse swaps newText and previousText", () => {
    const inverse = computeInverse(textOp);
    expect(inverse.kind).toBe("text-edit");
    if (inverse.kind === "text-edit") {
      expect(inverse.newText).toBe("Hello");
      expect(inverse.previousText).toBe("World");
    }
  });

  test("class-add inverse is class-remove with same target", () => {
    const inverse = computeInverse(classOp);
    expect(inverse.kind).toBe("class-remove");
    if (inverse.kind === "class-remove") {
      expect(inverse.className).toBe("highlight");
      expect(inverse.target.runtimeId).toBe("el-j001");
    }
  });

  test("journal entries are appendable and undoable", () => {
    let cs: ChangeSet = createChangeSet({ workspaceId: "ws-j001", runtime: false });
    cs = appendOperation(cs, styleOp);
    cs = appendOperation(cs, textOp);
    expect(cs.operations.length).toBe(2);
    expect(cs.operations[0]?.id).toBe("style-j001");
    expect(cs.operations[1]?.id).toBe("text-j001");
  });

  test("undo restores the previous style value via the stored inverse", () => {
    const entry = createJournalEntry({
      id: "je-undo-01",
      changeSetId: "cs-j01",
      transactionId: "tx-j01",
      sequence: 0,
      operation: styleOp,
    });
    const journal = appendEntry(createJournal(), entry);
    expect(canUndoJournal(journal)).toBe(true);

    const { inverse, journal: afterUndo } = undo(journal);
    expect(inverse.kind).toBe("style-edit");
    if (inverse.kind === "style-edit") {
      expect(inverse.value).toBe("10px");
      expect(inverse.previousValue).toBe("24px");
    }
    expect(canUndoJournal(afterUndo)).toBe(false);
    expect(canRedoJournal(afterUndo)).toBe(true);
  });

  test("redo re-applies the undone operation", () => {
    const entry = createJournalEntry({
      id: "je-redo-01",
      changeSetId: "cs-j02",
      transactionId: "tx-j02",
      sequence: 0,
      operation: styleOp,
    });
    let journal = appendEntry(createJournal(), entry);
    const undoResult = undo(journal);
    journal = undoResult.journal;

    const redoResult = redo(journal);
    expect(redoResult.operation.kind).toBe("style-edit");
    if (redoResult.operation.kind === "style-edit") {
      expect(redoResult.operation.value).toBe("24px");
    }
    expect(canUndoJournal(redoResult.journal)).toBe(true);
  });

  test("daemon reconnect restores the journal from serialized persistence", () => {
    const entry = createJournalEntry({
      id: "je-restore-01",
      changeSetId: "cs-restore",
      transactionId: "tx-restore",
      sequence: 0,
      operation: styleOp,
    });
    const entry2 = createJournalEntry({
      id: "je-restore-02",
      changeSetId: "cs-restore",
      transactionId: "tx-restore",
      sequence: 1,
      operation: textOp,
    });
    const entry3 = createJournalEntry({
      id: "je-restore-03",
      changeSetId: "cs-restore",
      transactionId: "tx-restore",
      sequence: 2,
      operation: classOp,
    });
    const journal = [entry, entry2, entry3].reduce(appendEntry, createJournal());

    const serialized = serializeJournal(journal);
    expect(serialized.length).toBeGreaterThan(0);

    const result = deserializeJournal(serialized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries).toHaveLength(3);
      expect(result.data.entries[0]?.id).toBe("je-restore-01");
      expect(result.data.entries[2]?.id).toBe("je-restore-03");
    }
  });
});

const STYLE_FIXTURE = fixtureHtml(
  '<div id="target" class="pad-target">Box</div>',
  "<style>.pad-target{padding:10px;width:100px;height:50px;border:2px solid #333}</style>",
);

const TEXT_FIXTURE = fixtureHtml('<div id="target">Hello</div>');

test.describe("@journal-undo-redo browser", () => {
  extTest(
    "preview style injection mutates computed padding and rollback restores it",
    async ({ page }) => {
      await serveFixture(page, STYLE_FIXTURE);
      const rect = await pageElementRect(page, "#target");
      await page.mouse.click(rect.x + 5, rect.y + 5);
      await page.waitForTimeout(800);

      const initial = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);

      const previewApplied = await page.evaluate(() => {
        const el = document.getElementById("target");
        if (!el) throw new Error("element #target not found");
        const runtimeId = el.getAttribute("data-vc-preview-id");
        if (runtimeId === null) return false;
        const style = document.createElement("style");
        style.setAttribute("data-vc-preview-style", "");
        style.textContent = `[data-vc-preview-id="${runtimeId}"] { padding: 24px; }`;
        document.head.appendChild(style);
        return true;
      });
      extExpect(previewApplied).toBe(true);

      const mutated = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(mutated).not.toBe(initial);

      await page.evaluate(() => {
        const style = document.head.querySelector("style[data-vc-preview-style]");
        style?.remove();
      });
      const restored = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(restored).toBe(initial);
    },
  );

  extTest("text edit preview mutates textContent and inverse restores it", async ({ page }) => {
    await serveFixture(page, TEXT_FIXTURE);
    const target = page.locator("#target");
    const before = await target.textContent();
    extExpect(before).toBe("Hello");

    await target.evaluate((el) => {
      el.textContent = "World";
    });
    const after = await target.textContent();
    extExpect(after).toBe("World");

    await target.evaluate((el) => {
      el.textContent = "Hello";
    });
    const restored = await target.textContent();
    extExpect(restored).toBe("Hello");
  });

  extTest(
    "style-edit inverse applied to the real DOM restores the prior value",
    async ({ page }) => {
      await serveFixture(page, STYLE_FIXTURE);
      const rect = await pageElementRect(page, "#target");
      await page.mouse.click(rect.x + 5, rect.y + 5);
      await page.waitForTimeout(800);

      const initial = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);

      await page.evaluate(() => {
        const el = document.getElementById("target");
        if (!el) throw new Error("element #target not found");
        const runtimeId = el.getAttribute("data-vc-preview-id");
        if (runtimeId === null) return;
        const style = document.createElement("style");
        style.setAttribute("data-vc-preview-style", "");
        style.textContent = `[data-vc-preview-id="${runtimeId}"] { padding: 24px; }`;
        document.head.appendChild(style);
      });
      const mutated = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(mutated).not.toBe(initial);

      await page.evaluate(() => {
        const el = document.getElementById("target");
        if (!el) throw new Error("element #target not found");
        const runtimeId = el.getAttribute("data-vc-preview-id");
        if (runtimeId === null) return;
        const style = document.head.querySelector("style[data-vc-preview-style]");
        style?.remove();
        const inverse = document.createElement("style");
        inverse.setAttribute("data-vc-preview-style", "");
        inverse.textContent = `[data-vc-preview-id="${runtimeId}"] { padding: 10px; }`;
        document.head.appendChild(inverse);
      });
      const restored = await page
        .locator("#target")
        .evaluate((el) => getComputedStyle(el).paddingTop);
      extExpect(restored).toBe(initial);
    },
  );

  extTest("selection overlay tracks the journal's edit target element", async ({ page }) => {
    await serveFixture(page, STYLE_FIXTURE);
    const rect = await pageElementRect(page, "#target");
    await page.mouse.click(rect.x + 5, rect.y + 5);
    await page.waitForTimeout(800);

    const outline = await overlayElementInfo(page, ".vc-select-outline");
    extExpect(outline).not.toBeNull();
    if (!outline) throw new Error("outline should not be null after assertion");
    extExpect(Math.abs(outline.x - rect.x)).toBeLessThanOrEqual(3);
  });
});
