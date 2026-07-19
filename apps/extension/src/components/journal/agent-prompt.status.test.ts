import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
  markEntrySuperseded,
  redo,
  undo,
} from "@vision-control/change-journal";
import { describe, expect, it } from "vitest";

import { buildAgentPrompt } from "./agent-prompt.js";

const TARGET_RUNTIME_ID = "inactive-history-target";
const ENTRY_ID = "je-agent-status";

const committedJournal = (): Journal => {
  const operation: Operation = {
    id: "op-agent-status",
    timestamp: 1_700_000_000_000,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "style-edit",
    target: { runtimeId: TARGET_RUNTIME_ID },
    property: "color",
    value: "blue",
    important: false,
    previousValue: "red",
  };
  return appendEntry(
    createJournal(),
    createJournalEntry({
      id: ENTRY_ID,
      changeSetId: "cs-agent-status",
      transactionId: "tx-agent-status",
      sequence: 0,
      operation,
      status: "committed",
    }),
  );
};

const promptFor = (journal: Journal): string =>
  buildAgentPrompt({ selection: null, journal, compiledAt: 1_700_000_000_000 });

describe("buildAgentPrompt active journal routing", () => {
  it("routes a committed operation identity into the copied handoff", () => {
    expect(promptFor(committedJournal())).toContain(TARGET_RUNTIME_ID);
  });

  it("excludes a reverted operation identity after Undo", () => {
    const reverted = undo(committedJournal()).journal;

    expect(promptFor(reverted)).not.toContain(TARGET_RUNTIME_ID);
  });

  it("routes the operation identity again after Redo", () => {
    const redone = redo(undo(committedJournal()).journal).journal;

    expect(promptFor(redone)).toContain(TARGET_RUNTIME_ID);
  });

  it("excludes a superseded operation identity", () => {
    const superseded = markEntrySuperseded(committedJournal(), ENTRY_ID);

    expect(promptFor(superseded)).not.toContain(TARGET_RUNTIME_ID);
  });
});
