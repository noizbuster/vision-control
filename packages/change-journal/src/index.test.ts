import { computeInverse, type Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  clear,
  commitStatus,
  createJournal,
  createJournalEntry,
  deserializeJournal,
  type Journal,
  type JournalDaemonClient,
  type JournalEntry,
  JournalEntrySchema,
  markEntryCommitted,
  markEntryReverted,
  markEntrySuperseded,
  migrateJournalEntry_v1_to_v2,
  peekRedo,
  peekUndo,
  redo,
  restoreFromDaemon,
  StaleInverseError,
  serializeJournal,
  syncToDaemon,
  undo,
} from "./index.js";

const BASE_TIME = 1_700_000_000_000;

const styleEditOp = (id: string): Operation => ({
  id,
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "style-edit",
  target: { runtimeId: "btn-1" },
  property: "color",
  value: "blue",
  important: false,
  previousValue: "red",
});

/**
 * v2Defaults boilerplate for the PRD §12.1 fields every entry now carries.
 * Adopted from the Task 1 `v2Defaults` pattern so fixture diffs stay small.
 */
const v2Defaults = {
  transactionId: "tx-journal-001",
  sequence: 0,
  createdAt: BASE_TIME,
  actor: "human" as const,
  beforeSnapshot: { runtimeId: "btn-1", computedStyle: { color: "red" } },
  afterSnapshot: { runtimeId: "btn-1", computedStyle: { color: "blue" } },
} as const;

const entry = (
  id: string,
  op: Operation,
  status: JournalEntry["status"] = "committed",
): JournalEntry =>
  createJournalEntry({
    id,
    changeSetId: "csjournal001",
    operation: op,
    ...v2Defaults,
    appliedAt: BASE_TIME,
    status,
  });

describe("journal entry schema", () => {
  it("accepts a valid entry", () => {
    expect(
      JournalEntrySchema.safeParse(entry("je-entry-0001", styleEditOp("op-je-00001"))).success,
    ).toBe(true);
  });

  it("rejects an entry with a bad status", () => {
    const bad = { ...entry("je-entry-0002", styleEditOp("op-je-00002")), status: "garbage" };
    expect(JournalEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an entry whose inverse is not a valid operation", () => {
    const valid = entry("je-entry-0003", styleEditOp("op-je-00003"));
    const bad = { ...valid, inverse: { kind: "not-a-real-kind" } };
    expect(JournalEntrySchema.safeParse(bad).success).toBe(false);
  });
});

describe("createJournalEntry stores the inverse at record time", () => {
  it("the stored inverse equals computeInverse(operation) modulo fresh id/timestamp", () => {
    const op = styleEditOp("op-je-store01");
    const e = createJournalEntry({
      id: "je-store-0001",
      changeSetId: "cs-1",
      transactionId: "tx-1",
      sequence: 0,
      operation: op,
    });
    const direct = computeInverse(op);
    expect(e.inverse.inverseOf).toBe(op.id);
    expect(e.inverse.kind).toBe(direct.kind);
    if (e.inverse.kind === "style-edit" && direct.kind === "style-edit") {
      expect(e.inverse.value).toBe(direct.value);
      expect(e.inverse.previousValue).toBe(direct.previousValue);
      expect(e.inverse.important).toBe(direct.important);
    }
  });

  it("defaults actor to system, status to preview, snapshots to null", () => {
    const e = createJournalEntry({
      id: "je-store-0002",
      changeSetId: "cs-1",
      transactionId: "tx-1",
      sequence: 0,
      operation: styleEditOp("op-je-store02"),
    });
    expect(e.actor).toBe("system");
    expect(e.status).toBe("preview");
    expect(e.beforeSnapshot).toBeNull();
    expect(e.afterSnapshot).toBeNull();
    expect(e.preconditions).toEqual([]);
    expect(e.evidence).toEqual([]);
  });
});

describe("appendEntry and stack invariants", () => {
  it("createJournal starts empty with nothing undoable/redoable", () => {
    const j = createJournal();
    expect(j.entries).toHaveLength(0);
    expect(canUndoJournal(j)).toBe(false);
    expect(canRedoJournal(j)).toBe(false);
  });

  it("appendEntry pushes onto the undo stack", () => {
    const j = appendEntry(createJournal(), entry("je-entry-e1", styleEditOp("op-je-entrye1")));
    expect(j.entries).toHaveLength(1);
    expect(canUndoJournal(j)).toBe(true);
    expect(canRedoJournal(j)).toBe(false);
    expect(peekUndo(j)).toBe("je-entry-e1");
  });

  it("a NEW operation clears the redo stack (standard undo/redo)", () => {
    let j = appendEntry(createJournal(), entry("je-entry-aa", styleEditOp("op-je-entryaa")));
    j = undo(j).journal;
    // After undo: redo stack holds the entry, undo is empty.
    expect(canRedoJournal(j)).toBe(true);
    expect(canUndoJournal(j)).toBe(false);
    // Append a new entry: redo must be cleared.
    j = appendEntry(j, entry("je-entry-bb", styleEditOp("op-je-entrybb")));
    expect(canRedoJournal(j)).toBe(false);
    expect(canUndoJournal(j)).toBe(true);
    expect(peekRedo(j)).toBeUndefined();
  });
});

describe("undo / redo", () => {
  it("undo returns the STORED inverse and marks the entry reverted", () => {
    const op = styleEditOp("op-je-entryu1");
    const j0 = appendEntry(createJournal(), entry("je-entry-u1", op));
    const { journal: j1, inverse } = undo(j0);
    // The returned inverse IS the entry's stored inverse (same inverseOf link).
    expect(inverse.inverseOf).toBe(op.id);
    expect(canUndoJournal(j1)).toBe(false);
    expect(canRedoJournal(j1)).toBe(true);
    const reverted = j1.entries.find((e) => e.id === "je-entry-u1");
    expect(reverted?.status).toBe("reverted");
  });

  it("undo throws when the undo stack is empty", () => {
    expect(() => undo(createJournal())).toThrow(/undo stack is empty/);
  });

  it("undo throws when entryId is not the top of the undo stack", () => {
    const j = appendEntry(createJournal(), entry("je-entry-top", styleEditOp("op-je-entrytp")));
    expect(() => undo(j, "je-other-id")).toThrow(/not the top/);
  });

  it("redo returns the operation and moves the entry back to the undo stack", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-r1", styleEditOp("op-je-entryr1")));
    const { journal: j1 } = undo(j0);
    const { journal: j2, operation } = redo(j1);
    expect(operation.id).toBe("op-je-entryr1");
    expect(canUndoJournal(j2)).toBe(true);
    expect(canRedoJournal(j2)).toBe(false);
    const reapplied = j2.entries.find((e) => e.id === "je-entry-r1");
    expect(reapplied?.status).toBe("committed");
  });

  it("redo throws when the redo stack is empty", () => {
    const j = appendEntry(createJournal(), entry("je-entry-r2", styleEditOp("op-je-entryr2")));
    expect(() => redo(j)).toThrow(/redo stack is empty/);
  });
});

describe("undo uses the STORED inverse (PRD §12.1)", () => {
  type StyleState = Record<string, string>;
  const apply = (state: StyleState, op: Operation): StyleState => {
    if (op.kind === "style-edit") return { ...state, [op.property]: op.value };
    return state;
  };

  it("commit -> undo (apply stored inverse) -> redo (re-apply op) round-trips", () => {
    const initial: StyleState = { color: "red" };
    const op = styleEditOp("op-je-roundtr");
    const j0 = appendEntry(createJournal(), entry("je-entry-rt", op));

    let state = apply(initial, op);
    expect(state.color).toBe("blue");

    const undone = undo(j0);
    state = apply(state, undone.inverse);
    expect(state).toEqual(initial);

    const redone = redo(undone.journal);
    state = apply(state, redone.operation);
    expect(state.color).toBe("blue");
  });

  it("the STORED inverse returned by undo equals a freshly recomputed inverse", () => {
    const op = styleEditOp("op-je-consist");
    const j = appendEntry(createJournal(), entry("je-entry-cs", op));
    const { inverse } = undo(j);
    const direct = computeInverse(op);
    // id and timestamp are freshly generated on each computeInverse call, so
    // compare every meaningful field — the stored inverse must match the
    // recomputed semantics exactly.
    expect(inverse.inverseOf).toBe(direct.inverseOf);
    expect(inverse.kind).toBe(direct.kind);
    expect(inverse.runtime).toBe(direct.runtime);
    if (inverse.kind === "style-edit" && direct.kind === "style-edit") {
      expect(inverse.property).toBe(direct.property);
      expect(inverse.value).toBe(direct.value);
      expect(inverse.previousValue).toBe(direct.previousValue);
      expect(inverse.important).toBe(direct.important);
    }
  });

  it("a corrupt/stale stored inverse throws a typed StaleInverseError", () => {
    const valid = entry("je-entry-stale", styleEditOp("op-je-stale01"));
    // Corrupt the stored inverse to an invalid operation shape.
    const corrupted: JournalEntry = {
      ...valid,
      inverse: { kind: "not-real" } as unknown as Operation,
    };
    const j = appendEntry(createJournal(), corrupted);
    let caught: unknown;
    try {
      undo(j);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StaleInverseError);
    expect((caught as StaleInverseError).entryId).toBe("je-entry-stale");
  });
});

describe("supersede path", () => {
  it("markEntrySuperseded transitions an entry to superseded", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-sup1", styleEditOp("op-je-sup0001")));
    const j1 = markEntrySuperseded(j0, "je-entry-sup1");
    expect(commitStatus(j1, "je-entry-sup1")).toBe("superseded");
  });

  it("markEntrySuperseded throws for an unknown entry id", () => {
    expect(() => markEntrySuperseded(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });
});

describe("clear", () => {
  it("resets the journal to empty", () => {
    const cleared = clear();
    expect(cleared.entries).toHaveLength(0);
    expect(canUndoJournal(cleared)).toBe(false);
  });
});

describe("commit status", () => {
  it("commitStatus reports the entry status", () => {
    const j = appendEntry(
      createJournal(),
      entry("je-entry-cs1", styleEditOp("op-je-entrycs1"), "preview"),
    );
    expect(commitStatus(j, "je-entry-cs1")).toBe("preview");
  });

  it("commitStatus throws for an unknown entry id", () => {
    expect(() => commitStatus(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("markEntryCommitted transitions preview -> committed", () => {
    const j0 = appendEntry(
      createJournal(),
      entry("je-entry-mc1", styleEditOp("op-je-entrymc1"), "preview"),
    );
    const j1 = markEntryCommitted(j0, "je-entry-mc1");
    expect(commitStatus(j1, "je-entry-mc1")).toBe("committed");
    expect(canUndoJournal(j1)).toBe(true);
  });

  it("markEntryCommitted throws for an unknown entry id", () => {
    expect(() => markEntryCommitted(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("markEntryReverted transitions to reverted", () => {
    const j0 = appendEntry(
      createJournal(),
      entry("je-entry-mr1", styleEditOp("op-je-entrymr1"), "committed"),
    );
    const j1 = markEntryReverted(j0, "je-entry-mr1");
    expect(commitStatus(j1, "je-entry-mr1")).toBe("reverted");
  });

  it("markEntryReverted throws for an unknown entry id", () => {
    expect(() => markEntryReverted(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("redo marks the re-applied entry committed", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-rd1", styleEditOp("op-je-entryrd1")));
    const undone = undo(j0);
    const redone = redo(undone.journal);
    expect(commitStatus(redone.journal, "je-entry-rd1")).toBe("committed");
  });
});

describe("migrateJournalEntry_v1_to_v2", () => {
  it("migrates a v1 entry to a valid v2 shape with mapped status and computed inverse", () => {
    const v1Entry = {
      id: "je-mig-0001",
      changeSetId: "cs-mig-0001",
      operation: styleEditOp("op-je-mig0001"),
      appliedAt: BASE_TIME,
      status: "rolled-back",
      beforeSnapshot: { color: "red" },
      afterSnapshot: { color: "blue" },
    };
    const migrated = migrateJournalEntry_v1_to_v2(v1Entry);
    expect(migrated.id).toBe("je-mig-0001");
    expect(migrated.status).toBe("reverted");
    expect(migrated.actor).toBe("system");
    expect(migrated.transactionId).toBe("migrated:je-mig-0001");
    expect(migrated.sequence).toBe(0);
    expect(migrated.inverse.inverseOf).toBe("op-je-mig0001");
    // Ad-hoc v1 snapshot preserved under a placeholder runtimeId.
    expect(migrated.beforeSnapshot?.runtimeId).toBe("<unknown>");
    expect(migrated.beforeSnapshot).toMatchObject({ color: "red" });
    // Re-validate the migrated entry through the schema (round-trip).
    expect(JournalEntrySchema.safeParse(migrated).success).toBe(true);
  });

  it("maps v1 pending -> preview and committed -> committed", () => {
    const pending = migrateJournalEntry_v1_to_v2({
      id: "je-mig-0002",
      operation: styleEditOp("op-je-mig0002"),
      status: "pending",
    });
    expect(pending.status).toBe("preview");
    const committed = migrateJournalEntry_v1_to_v2({
      id: "je-mig-0003",
      operation: styleEditOp("op-je-mig0003"),
      status: "committed",
    });
    expect(committed.status).toBe("committed");
  });

  it("rejects a malformed v1 entry (bad operation)", () => {
    expect(() =>
      migrateJournalEntry_v1_to_v2({
        id: "je-mig-0004",
        operation: { kind: "nope" },
        status: "committed",
      }),
    ).toThrow();
  });
});

describe("persistence", () => {
  it("serialize -> deserialize round-trips an empty journal", () => {
    const j = createJournal();
    const restored = deserializeJournal(serializeJournal(j));
    expect(restored.success).toBe(true);
    if (restored.success) {
      expect(restored.data.entries).toHaveLength(0);
      expect(restored.data.stacks.undo).toHaveLength(0);
      expect(restored.data.stacks.redo).toHaveLength(0);
    }
  });

  it("serialize -> deserialize round-trips entries and stacks", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-rt1", styleEditOp("op-je-rt00001")));
    const j1 = appendEntry(j0, entry("je-entry-rt2", styleEditOp("op-je-rt00002")));
    const undone = undo(j1);

    const restored = deserializeJournal(serializeJournal(undone.journal));
    expect(restored.success).toBe(true);
    if (!restored.success) return;
    const data: Journal = restored.data;
    expect(data.entries).toHaveLength(2);
    expect(data.stacks.undo).toEqual(["je-entry-rt1"]);
    expect(data.stacks.redo).toEqual(["je-entry-rt2"]);
    const reverted = data.entries.find((e) => e.id === "je-entry-rt2");
    expect(reverted?.status).toBe("reverted");
    const first = data.entries.find((e) => e.id === "je-entry-rt1");
    expect(first?.operation.kind).toBe("style-edit");
    // The stored inverse survives the round-trip.
    expect(first?.inverse.inverseOf).toBe("op-je-rt00001");
  });

  it("deserialize returns a structured error for invalid JSON", () => {
    const result = deserializeJournal("{ not json");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Invalid JSON");
    }
  });

  it("deserialize returns a structured error for a schema mismatch", () => {
    const result = deserializeJournal(JSON.stringify({ entries: [], stacks: {} }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Journal validation failed");
    }
  });
});

describe("session sync", () => {
  interface FakeClient {
    readonly client: JournalDaemonClient;
    readonly sent: ReadonlyArray<{ readonly messageType: string; readonly payload: unknown }>;
    emit(messageType: string, payload: unknown): void;
  }

  function makeFakeClient(state: JournalDaemonClient["state"]): FakeClient {
    const sent: Array<{ readonly messageType: string; readonly payload: unknown }> = [];
    const handlers = new Set<
      (message: { readonly messageType: string; readonly payload: unknown }) => void
    >();
    return {
      client: {
        state,
        send: (messageType, payload) => {
          sent.push({ messageType, payload });
        },
        onMessage: (handler) => {
          handlers.add(handler);
          return () => {
            handlers.delete(handler);
          };
        },
      },
      sent,
      emit: (messageType, payload) => {
        for (const handler of handlers) handler({ messageType, payload });
      },
    };
  }

  it("syncToDaemon serializes and sends when connected", async () => {
    const fake = makeFakeClient("connected");
    const j = appendEntry(createJournal(), entry("je-entry-sy1", styleEditOp("op-je-sy00001")));
    const result = await syncToDaemon(j, fake.client);
    expect(result.synced).toBe(true);
    if (result.synced) {
      expect(result.entryCount).toBe(1);
    }
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]?.messageType).toBe("journal-sync");
    expect(typeof fake.sent[0]?.payload).toBe("string");
  });

  it("syncToDaemon is a no-op when disconnected (local fallback)", async () => {
    const fake = makeFakeClient("disconnected");
    const j = appendEntry(createJournal(), entry("je-entry-sy2", styleEditOp("op-je-sy00002")));
    const result = await syncToDaemon(j, fake.client);
    expect(result.synced).toBe(false);
    if (!result.synced) {
      expect(result.reason).toBe("disconnected");
    }
    expect(fake.sent).toHaveLength(0);
  });

  it("restoreFromDaemon resolves with the deserialized journal on a matching response", async () => {
    const fake = makeFakeClient("connected");
    const original = appendEntry(
      createJournal(),
      entry("je-entry-rs1", styleEditOp("op-je-rs00001")),
    );
    const serialized = serializeJournal(original);

    const promise = restoreFromDaemon(fake.client, 1000);
    fake.emit("journal-restore-response", serialized);

    const restored = await promise;
    expect(restored).not.toBeNull();
    expect(restored?.entries).toHaveLength(1);
    expect(restored?.entries[0]?.id).toBe("je-entry-rs1");
  });

  it("restoreFromDaemon resolves null on a parse failure response", async () => {
    const fake = makeFakeClient("connected");
    const promise = restoreFromDaemon(fake.client, 1000);
    fake.emit("journal-restore-response", "{ broken");
    expect(await promise).toBeNull();
  });

  it("restoreFromDaemon returns null when disconnected", async () => {
    const fake = makeFakeClient("disconnected");
    expect(await restoreFromDaemon(fake.client, 100)).toBeNull();
  });

  it("restoreFromDaemon returns null on timeout", async () => {
    const fake = makeFakeClient("connected");
    expect(await restoreFromDaemon(fake.client, 10)).toBeNull();
  });
});
