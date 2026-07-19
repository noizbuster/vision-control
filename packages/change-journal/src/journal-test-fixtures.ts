import type { Operation } from "@vision-control/change-ir";

import { createJournalEntry, type JournalEntry } from "./journal.js";

export const BASE_TIME = 1_700_000_000_000;

export const styleEditOperation = (id: string): Operation => ({
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

export const journalEntry = (
  id: string,
  operation: Operation,
  status: JournalEntry["status"] = "committed",
): JournalEntry =>
  createJournalEntry({
    id,
    changeSetId: "csjournal001",
    transactionId: "tx-journal-001",
    sequence: 0,
    createdAt: BASE_TIME,
    actor: "human",
    beforeSnapshot: { runtimeId: "btn-1", computedStyle: { color: "red" } },
    afterSnapshot: { runtimeId: "btn-1", computedStyle: { color: "blue" } },
    operation,
    appliedAt: BASE_TIME,
    status,
  });
