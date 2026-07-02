import type { JournalEntry } from "@vision-control/change-journal";
import type { ReactElement } from "react";

import { JournalEntryView } from "./JournalEntry.js";
import { JournalToolbar } from "./JournalToolbar.js";

interface ChangeJournalProps {
  readonly entries: readonly JournalEntry[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly pendingCount: number;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClear: () => void;
}

export function ChangeJournal({
  entries,
  canUndo,
  canRedo,
  pendingCount,
  onUndo,
  onRedo,
  onClear,
}: ChangeJournalProps): ReactElement {
  return (
    <section className="change-journal" aria-label="Change journal">
      <header className="change-journal__header">
        <h2>Change Journal</h2>
      </header>
      <JournalToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        pendingCount={pendingCount}
        onUndo={onUndo}
        onRedo={onRedo}
        onClear={onClear}
      />
      {entries.length === 0 ? (
        <p className="change-journal__empty" data-testid="change-journal-empty">
          No changes recorded yet.
        </p>
      ) : (
        <ol className="change-journal__list" data-testid="change-journal-list">
          {entries.map((entry) => (
            <JournalEntryView
              key={entry.id}
              id={entry.id}
              operation={entry.operation}
              status={entry.status}
              appliedAt={entry.appliedAt}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
