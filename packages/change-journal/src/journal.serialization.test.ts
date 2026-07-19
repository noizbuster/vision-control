import { describe, expect, it } from "vitest";

import {
  appendEntry,
  createJournal,
  deserializeJournal,
  type Journal,
  JournalEntrySchema,
  migrateJournalEntry_v1_to_v2,
  serializeJournal,
  undo,
} from "./index.js";
import { BASE_TIME, journalEntry, styleEditOperation } from "./journal-test-fixtures.js";

describe("legacy journal migration", () => {
  it("migrates v1 shape, status, inverse, and snapshots", () => {
    const migrated = migrateJournalEntry_v1_to_v2({
      id: "je-mig-0001",
      changeSetId: "cs-mig-0001",
      operation: styleEditOperation("op-je-mig0001"),
      appliedAt: BASE_TIME,
      status: "rolled-back",
      beforeSnapshot: { color: "red" },
      afterSnapshot: { color: "blue" },
    });
    expect(migrated.id).toBe("je-mig-0001");
    expect(migrated.status).toBe("reverted");
    expect(migrated.actor).toBe("system");
    expect(migrated.transactionId).toBe("migrated:je-mig-0001");
    expect(migrated.sequence).toBe(0);
    expect(migrated.inverse.inverseOf).toBe("op-je-mig0001");
    expect(migrated.beforeSnapshot?.runtimeId).toBe("<unknown>");
    expect(migrated.beforeSnapshot).toMatchObject({ color: "red" });
    expect(JournalEntrySchema.safeParse(migrated).success).toBe(true);
  });

  it("maps pending and committed statuses", () => {
    const pending = migrateJournalEntry_v1_to_v2({
      id: "je-mig-0002",
      operation: styleEditOperation("op-je-mig0002"),
      status: "pending",
    });
    const committed = migrateJournalEntry_v1_to_v2({
      id: "je-mig-0003",
      operation: styleEditOperation("op-je-mig0003"),
      status: "committed",
    });
    expect(pending.status).toBe("preview");
    expect(committed.status).toBe("committed");
  });

  it("rejects malformed v1 operations", () => {
    expect(() =>
      migrateJournalEntry_v1_to_v2({
        id: "je-mig-0004",
        operation: { kind: "nope" },
        status: "committed",
      }),
    ).toThrow();
  });
});

describe("journal serialization", () => {
  it("round-trips an empty journal", () => {
    const restored = deserializeJournal(serializeJournal(createJournal()));
    expect(restored.success).toBe(true);
    if (!restored.success) return;
    expect(restored.data.entries).toHaveLength(0);
    expect(restored.data.stacks.undo).toHaveLength(0);
    expect(restored.data.stacks.redo).toHaveLength(0);
  });

  it("round-trips entries, stacks, statuses, and stored inverses", () => {
    const first = appendEntry(
      createJournal(),
      journalEntry("je-entry-rt1", styleEditOperation("op-je-rt00001")),
    );
    const second = appendEntry(
      first,
      journalEntry("je-entry-rt2", styleEditOperation("op-je-rt00002")),
    );
    const restored = deserializeJournal(serializeJournal(undo(second).journal));
    expect(restored.success).toBe(true);
    if (!restored.success) return;
    const data: Journal = restored.data;
    expect(data.entries).toHaveLength(2);
    expect(data.stacks.undo).toEqual(["je-entry-rt1"]);
    expect(data.stacks.redo).toEqual(["je-entry-rt2"]);
    expect(data.entries.find((entry) => entry.id === "je-entry-rt2")?.status).toBe("reverted");
    const firstEntry = data.entries.find((entry) => entry.id === "je-entry-rt1");
    expect(firstEntry?.operation.kind).toBe("style-edit");
    expect(firstEntry?.inverse.inverseOf).toBe("op-je-rt00001");
  });

  it("returns a structured failure for invalid JSON", () => {
    const invalidJson = deserializeJournal("{ not json");
    expect(invalidJson.success).toBe(false);
    if (!invalidJson.success) expect(invalidJson.error.message).toBe("Invalid JSON");
  });

  it("returns a structured failure for schema mismatch", () => {
    const mismatch = deserializeJournal(JSON.stringify({ entries: [], stacks: {} }));
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(mismatch.error.message).toBe("Journal validation failed");
  });
});
