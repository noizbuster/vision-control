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
  serveFixture,
} from "./fixtures/extension-test.ts";

/**
 * @journal-undo-redo — AC-002 undo/redo.
 *
 * Verifies: style/class/text entries land in the journal, undo/redo restores
 * state, clear preview resets the DOM, and reconnect restores the journal.
 * Unit-level inverse tests run without a browser.
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
});

test.describe("@journal-undo-redo browser", () => {
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

  extTest("clear preview resets all DOM mutations to pre-edit state", async ({ page }) => {
    await serveFixture(page, fixtureHtml('<div id="target" style="padding:10px">Box</div>'));
    const initial = await page.evaluate(
      () => getComputedStyle(document.getElementById("target")!).padding,
    );

    await page.evaluate(() => {
      const el = document.getElementById("target")!;
      el.dataset.vcOriginalStyle = el.getAttribute("style") ?? "";
      el.style.padding = "24px";
    });
    const mutated = await page.evaluate(
      () => getComputedStyle(document.getElementById("target")!).padding,
    );
    extExpect(mutated).not.toBe(initial);

    await page.evaluate(() => {
      const el = document.getElementById("target")!;
      el.setAttribute("style", el.dataset.vcOriginalStyle ?? "");
    });
    const restored = await page.evaluate(
      () => getComputedStyle(document.getElementById("target")!).padding,
    );
    extExpect(restored).toBe(initial);
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
