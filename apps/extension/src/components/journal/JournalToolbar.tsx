import type { ReactElement } from "react";

interface JournalToolbarProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly pendingCount: number;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClear: () => void;
}

export function JournalToolbar({
  canUndo,
  canRedo,
  pendingCount,
  onUndo,
  onRedo,
  onClear,
}: JournalToolbarProps): ReactElement {
  const transactionStatus = pendingCount > 0 ? `${pendingCount} pending` : "idle";

  return (
    <div className="journal-toolbar">
      <div className="journal-toolbar__buttons">
        <button
          type="button"
          className="journal-toolbar__button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo last change"
        >
          Undo
        </button>
        <button
          type="button"
          className="journal-toolbar__button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo change"
        >
          Redo
        </button>
        <button
          type="button"
          className="journal-toolbar__button journal-toolbar__button--danger"
          onClick={onClear}
          disabled={!canUndo && !canRedo && pendingCount === 0}
          aria-label="Clear all changes"
        >
          Clear
        </button>
      </div>
      <span
        className="journal-toolbar__status"
        data-testid="journal-transaction-status"
        data-pending={pendingCount}
      >
        {transactionStatus}
      </span>
    </div>
  );
}
