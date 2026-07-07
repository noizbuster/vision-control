import type { ReactElement } from "react";

interface JournalToolbarProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canCopyAgentPrompt: boolean;
  readonly agentPromptCopyState: "idle" | "copied" | "error";
  readonly pendingCount: number;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClear: () => void;
  readonly onCopyAgentPrompt: () => void;
}

export function JournalToolbar({
  canUndo,
  canRedo,
  canCopyAgentPrompt,
  agentPromptCopyState,
  pendingCount,
  onUndo,
  onRedo,
  onClear,
  onCopyAgentPrompt,
}: JournalToolbarProps): ReactElement {
  const transactionStatus = pendingCount > 0 ? `${pendingCount} pending` : "idle";
  const promptStatus =
    agentPromptCopyState === "copied"
      ? "Agent prompt copied"
      : agentPromptCopyState === "error"
        ? "Copy failed"
        : "";

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
        <button
          type="button"
          className="journal-toolbar__button"
          onClick={onCopyAgentPrompt}
          disabled={!canCopyAgentPrompt}
          aria-label="Copy agent prompt"
          data-testid="copy-agent-prompt"
        >
          Copy Agent Prompt
        </button>
      </div>
      <div className="journal-toolbar__status-group">
        <span
          className="journal-toolbar__status"
          data-testid="journal-transaction-status"
          data-pending={pendingCount}
        >
          {transactionStatus}
        </span>
        <span
          className="journal-toolbar__prompt-status"
          data-state={agentPromptCopyState}
          data-testid="agent-prompt-copy-status"
          aria-live="polite"
        >
          {promptStatus}
        </span>
      </div>
    </div>
  );
}
