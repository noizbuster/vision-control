import type { Journal, JournalEntry } from "@vision-control/change-journal";

export type JournalHydrationMerge = {
  readonly journal: Journal;
  readonly hasLocalChanges: boolean;
};

export const mergeHydratedJournal = (stored: Journal, local: Journal): JournalHydrationMerge => {
  const storedOperationIds = new Set(stored.entries.map((entry) => entry.operation.id));
  const localEntries = local.entries
    .filter((entry) => !storedOperationIds.has(entry.operation.id))
    .sort((left, right) => left.sequence - right.sequence);
  if (localEntries.length === 0) return { journal: stored, hasLocalChanges: false };

  const firstLocalSequence = stored.entries.reduce(
    (next, entry) => Math.max(next, entry.sequence + 1),
    0,
  );
  const resequenced = localEntries.map(
    (entry, index): JournalEntry => ({ ...entry, sequence: firstLocalSequence + index }),
  );
  const localEntryIds = new Set(resequenced.map((entry) => entry.id));

  return {
    journal: {
      entries: [...stored.entries, ...resequenced],
      stacks: {
        undo: [
          ...stored.stacks.undo,
          ...local.stacks.undo.filter((entryId) => localEntryIds.has(entryId)),
        ],
        redo: local.stacks.redo.filter((entryId) => localEntryIds.has(entryId)),
      },
    },
    hasLocalChanges: true,
  };
};
