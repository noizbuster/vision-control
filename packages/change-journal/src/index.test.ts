import { computeInverse, type Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  clear,
  commitStatus,
  createJournal,
  deserializeJournal,
  type Journal,
  type JournalDaemonClient,
  type JournalEntry,
  JournalEntrySchema,
  markEntryCommitted,
  markEntryRolledBack,
  peekRedo,
  peekUndo,
  redo,
  restoreFromDaemon,
  serializeJournal,
  syncToDaemon,
  undo,
} from "./index.js";

const BASE_TIME = 1_700_000_000_000;

const styleEditOp = (id: string): Operation => ({
  id,
  timestamp: BASE_TIME,
  runtime: false,
  kind: "style-edit",
  target: { runtimeId: "btn-1" },
  property: "color",
  value: "blue",
  important: false,
  previousValue: "red",
});

const entry = (
  id: string,
  op: Operation,
  status: JournalEntry["status"] = "committed",
): JournalEntry => ({
  id,
  changeSetId: "csjournal001",
  operation: op,
  appliedAt: BASE_TIME,
  status,
  beforeSnapshot: { color: "red" },
  afterSnapshot: { color: "blue" },
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
  it("undo returns the inverse and moves the entry to the redo stack", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-u1", styleEditOp("op-je-entryu1")));
    const { journal: j1, inverse } = undo(j0);
    expect(inverse.id).not.toBe("op-je-entryu1");
    expect(inverse.inverseOf).toBe("op-je-entryu1");
    expect(canUndoJournal(j1)).toBe(false);
    expect(canRedoJournal(j1)).toBe(true);
    const rolled = j1.entries.find((e) => e.id === "je-entry-u1");
    expect(rolled?.status).toBe("rolled-back");
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

describe("undo/redo model round-trip restores and re-applies", () => {
  type StyleState = Record<string, string>;
  const apply = (state: StyleState, op: Operation): StyleState => {
    if (op.kind === "style-edit") return { ...state, [op.property]: op.value };
    return state;
  };

  it("apply op -> undo (apply inverse) -> redo (re-apply op)", () => {
    const initial: StyleState = { color: "red" };
    const op = styleEditOp("op-je-roundtr");
    const j0 = appendEntry(createJournal(), entry("je-entry-rt", op));

    // Apply the recorded operation.
    let state = apply(initial, op);
    expect(state.color).toBe("blue");

    // Undo: apply the inverse.
    const undone = undo(j0);
    state = apply(state, undone.inverse);
    expect(state).toEqual(initial);

    // Redo: re-apply the original operation.
    const redone = redo(undone.journal);
    state = apply(state, redone.operation);
    expect(state.color).toBe("blue");
  });

  it("the journal's inverse is structurally equal to change-ir computeInverse", () => {
    const op = styleEditOp("op-je-consist");
    const j = appendEntry(createJournal(), entry("je-entry-cs", op));
    const { inverse } = undo(j);
    const direct = computeInverse(op);
    // id and timestamp are freshly generated on each computeInverse call, so
    // compare every other field (the meaningful inverse semantics).
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
      entry("je-entry-cs1", styleEditOp("op-je-entrycs1"), "pending"),
    );
    expect(commitStatus(j, "je-entry-cs1")).toBe("pending");
  });

  it("commitStatus throws for an unknown entry id", () => {
    expect(() => commitStatus(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("markEntryCommitted transitions pending -> committed", () => {
    const j0 = appendEntry(
      createJournal(),
      entry("je-entry-mc1", styleEditOp("op-je-entrymc1"), "pending"),
    );
    const j1 = markEntryCommitted(j0, "je-entry-mc1");
    expect(commitStatus(j1, "je-entry-mc1")).toBe("committed");
    expect(canUndoJournal(j1)).toBe(true);
  });

  it("markEntryCommitted throws for an unknown entry id", () => {
    expect(() => markEntryCommitted(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("markEntryRolledBack transitions to rolled-back", () => {
    const j0 = appendEntry(
      createJournal(),
      entry("je-entry-mr1", styleEditOp("op-je-entrymr1"), "committed"),
    );
    const j1 = markEntryRolledBack(j0, "je-entry-mr1");
    expect(commitStatus(j1, "je-entry-mr1")).toBe("rolled-back");
  });

  it("markEntryRolledBack throws for an unknown entry id", () => {
    expect(() => markEntryRolledBack(createJournal(), "je-entry-missing")).toThrow(/not found/);
  });

  it("redo marks the re-applied entry committed (not applied)", () => {
    const j0 = appendEntry(createJournal(), entry("je-entry-rd1", styleEditOp("op-je-entryrd1")));
    const undone = undo(j0);
    const redone = redo(undone.journal);
    expect(commitStatus(redone.journal, "je-entry-rd1")).toBe("committed");
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
    const rolled = data.entries.find((e) => e.id === "je-entry-rt2");
    expect(rolled?.status).toBe("rolled-back");
    const first = data.entries.find((e) => e.id === "je-entry-rt1");
    expect(first?.operation.kind).toBe("style-edit");
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
