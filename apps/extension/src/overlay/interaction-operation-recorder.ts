import { createOperationId, type Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
  JournalSchema,
} from "@vision-control/change-journal";

import {
  createJournalRequestMessage,
  JOURNAL_STATE_TYPE,
  parseJournalStatePayload,
} from "../journal/journal-messages.js";
import { createInteractionOperationMessage, type MessageBus } from "../messaging/index.js";

export interface InteractionOperationRecorderBus {
  readonly send: MessageBus["send"];
  readonly on: MessageBus["on"];
}

export interface InteractionOperationRecorderOptions {
  readonly bus: InteractionOperationRecorderBus;
  readonly onOperationApplied?: (operation: Operation) => void;
}

export interface InteractionOperationRecorder {
  readonly record: (operation: Operation) => void;
  readonly getJournal: () => Journal;
  readonly getRecordedOperations: () => readonly Operation[];
  readonly dispose: () => void;
}

const nextSequenceFor = (journal: Journal): number => {
  let nextSequence = 0;
  for (const entry of journal.entries) {
    nextSequence = Math.max(nextSequence, entry.sequence + 1);
  }
  return nextSequence;
};

export function createInteractionOperationRecorder(
  options: InteractionOperationRecorderOptions,
): InteractionOperationRecorder {
  const changeSetId = createOperationId();
  let journal: Journal = createJournal();
  let sequence = 0;
  const recorded: Operation[] = [];
  let contentTabId: number | undefined;

  const journalStateUnsubscribe = options.bus.on(JOURNAL_STATE_TYPE, (message) => {
    const payload = parseJournalStatePayload(message.payload);
    if (payload === null || payload.journal === null) return;
    if (contentTabId !== undefined && payload.tabId !== contentTabId) return;
    const parsed = JournalSchema.safeParse(payload.journal);
    if (!parsed.success) return;
    contentTabId = payload.tabId;
    journal = parsed.data;
    sequence = nextSequenceFor(parsed.data);
    recorded.length = 0;
    for (const entry of parsed.data.entries) recorded.push(entry.operation);
  });

  options.bus.send("background", createJournalRequestMessage());

  const record = (operation: Operation): void => {
    options.onOperationApplied?.(operation);
    recorded.push(operation);
    journal = appendEntry(
      journal,
      createJournalEntry({
        id: createOperationId(),
        changeSetId,
        transactionId: createOperationId(),
        sequence,
        operation,
      }),
    );
    sequence += 1;
    options.bus.send("background", createInteractionOperationMessage(operation));
  };

  return {
    record,
    getJournal: () => journal,
    getRecordedOperations: () => recorded,
    dispose: journalStateUnsubscribe,
  };
}
