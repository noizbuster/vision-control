import { act, renderHook } from "@testing-library/react";
import { appendEntry, createJournal, createJournalEntry } from "@vision-control/change-journal";
import { describe, expect, it } from "vitest";

import { makeFlexResizeOperation } from "../journal/flex-resize-operation.test-fixture.js";
import { useJournal } from "./useJournal.js";
import { styleEdit } from "./useJournal.test-fixtures.js";

describe("useJournal rehydrate", () => {
  it("restores aggregate history and continues unique sequencing", () => {
    const pair = makeFlexResizeOperation();
    const stored = appendEntry(
      createJournal(),
      createJournalEntry({
        id: "je-flex-rehydrate",
        changeSetId: "cs-flex-rehydrate",
        transactionId: "tx-flex-rehydrate",
        sequence: 4,
        operation: pair,
        status: "committed",
      }),
    );
    const { result } = renderHook(() => useJournal({ previewEngine: null }));
    act(() => result.current.replaceJournal(stored));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.operation).toEqual(pair);
    act(() => result.current.recordRemote(pair));
    expect(result.current.entries).toHaveLength(1);
    act(() => result.current.recordRemote(styleEdit("op-after-rehydrate", "green")));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]?.sequence).toBe(5);
    expect(result.current.entries[1]?.sequence).toBe(4);
  });
});
