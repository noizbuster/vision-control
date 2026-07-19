import { describe, expect, it } from "vitest";

import { appendEntry, createJournal, serializeJournal } from "./index.js";
import { journalEntry, styleEditOperation } from "./journal-test-fixtures.js";
import { type JournalDaemonClient, restoreFromDaemon, syncToDaemon } from "./session-sync.js";

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
      send: (messageType, payload) => sent.push({ messageType, payload }),
      onMessage: (handler) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    },
    sent,
    emit: (messageType, payload) => {
      for (const handler of handlers) handler({ messageType, payload });
    },
  };
}

describe("journal session sync", () => {
  it("serializes and sends when connected", async () => {
    const fake = makeFakeClient("connected");
    const journal = appendEntry(
      createJournal(),
      journalEntry("je-entry-sy1", styleEditOperation("op-je-sy00001")),
    );
    const result = await syncToDaemon(journal, fake.client);
    expect(result.synced).toBe(true);
    if (result.synced) expect(result.entryCount).toBe(1);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]?.messageType).toBe("journal-sync");
    expect(typeof fake.sent[0]?.payload).toBe("string");
  });

  it("is a local no-op when disconnected", async () => {
    const fake = makeFakeClient("disconnected");
    const journal = appendEntry(
      createJournal(),
      journalEntry("je-entry-sy2", styleEditOperation("op-je-sy00002")),
    );
    const result = await syncToDaemon(journal, fake.client);
    expect(result.synced).toBe(false);
    if (!result.synced) expect(result.reason).toBe("disconnected");
    expect(fake.sent).toHaveLength(0);
  });

  it("restores a matching serialized response", async () => {
    const fake = makeFakeClient("connected");
    const original = appendEntry(
      createJournal(),
      journalEntry("je-entry-rs1", styleEditOperation("op-je-rs00001")),
    );
    const promise = restoreFromDaemon(fake.client, 1000);
    fake.emit("journal-restore-response", serializeJournal(original));
    const restored = await promise;
    expect(restored?.entries).toHaveLength(1);
    expect(restored?.entries[0]?.id).toBe("je-entry-rs1");
  });

  it("returns null for a parse failure", async () => {
    const connected = makeFakeClient("connected");
    const parseFailure = restoreFromDaemon(connected.client, 1000);
    connected.emit("journal-restore-response", "{ broken");
    expect(await parseFailure).toBeNull();
  });

  it("returns null while disconnected", async () => {
    expect(await restoreFromDaemon(makeFakeClient("disconnected").client, 100)).toBeNull();
  });

  it("returns null on timeout", async () => {
    expect(await restoreFromDaemon(makeFakeClient("connected").client, 10)).toBeNull();
  });
});
