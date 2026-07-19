import { describe, expect, it } from "vitest";

import { makeFlexResizeOperation } from "./flex-resize.test-fixture.js";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  deserializeJournal,
  redo,
  serializeJournal,
  undo,
} from "./index.js";

describe("resize-flex-pair journal history", () => {
  it("records one aggregate entry and emits one aggregate undo and redo operation", () => {
    const operation = makeFlexResizeOperation();
    const entry = createJournalEntry({
      id: "je-flex-pair-001",
      changeSetId: "cs-flex-pair-001",
      transactionId: "tx-flex-pair-001",
      sequence: 0,
      operation,
      status: "committed",
    });
    const recorded = appendEntry(createJournal(), entry);

    expect(recorded.entries).toHaveLength(1);
    expect(entry.inverse.kind).toBe("resize-flex-pair");
    const undone = undo(recorded);
    expect(undone.inverse.kind).toBe("resize-flex-pair");
    if (undone.inverse.kind !== "resize-flex-pair") return;
    expect(undone.inverse.members[0].after).toEqual(operation.members[0].before);
    const redone = redo(undone.journal);
    expect(redone.operation).toEqual(operation);
  });

  it("round-trips the aggregate operation and stored inverse", () => {
    const operation = makeFlexResizeOperation();
    const journal = appendEntry(
      createJournal(),
      createJournalEntry({
        id: "je-flex-pair-002",
        changeSetId: "cs-flex-pair-001",
        transactionId: "tx-flex-pair-002",
        sequence: 0,
        operation,
      }),
    );

    const parsed = deserializeJournal(serializeJournal(journal));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries).toHaveLength(1);
    expect(parsed.data.entries[0]?.operation).toEqual(operation);
    expect(parsed.data.entries[0]?.inverse.kind).toBe("resize-flex-pair");
  });

  it("rehydrates a legacy v1 journal payload", () => {
    const operation = makeFlexResizeOperation();
    const legacyOperation = {
      id: "op-legacy-style-001",
      timestamp: operation.timestamp,
      runtime: false,
      origin: "property-panel",
      confidence: 1,
      kind: "style-edit",
      target: { runtimeId: "legacy-runtime" },
      property: "color",
      value: "blue",
      important: false,
      previousValue: "red",
    };
    const parsed = deserializeJournal(
      JSON.stringify({
        entries: [
          {
            id: "je-legacy-001",
            changeSetId: "cs-legacy-001",
            operation: legacyOperation,
            appliedAt: operation.timestamp,
            status: "committed",
          },
        ],
        stacks: { undo: ["je-legacy-001"], redo: [] },
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries[0]?.operation.kind).toBe("style-edit");
    expect(parsed.data.entries[0]?.inverse.kind).toBe("style-edit");
  });

  it("rejects a malformed pair before it can persist", () => {
    const operation = makeFlexResizeOperation();
    const malformed = {
      ...operation,
      members: [operation.members[0], operation.members[0]],
    };
    const entry = createJournalEntry({
      id: "je-flex-pair-003",
      changeSetId: "cs-flex-pair-001",
      transactionId: "tx-flex-pair-003",
      sequence: 0,
      operation,
    });
    const raw = JSON.stringify({
      entries: [{ ...entry, operation: malformed }],
      stacks: { undo: [entry.id], redo: [] },
    });

    expect(deserializeJournal(raw).success).toBe(false);
  });
});
