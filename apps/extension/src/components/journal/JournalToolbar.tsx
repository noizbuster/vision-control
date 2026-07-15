import type { ReactElement } from "react";

import type { ContextExportStatus } from "../../hooks/useContextExport.js";

interface JournalToolbarProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canCopyAgentPrompt: boolean;
  readonly agentPromptCopyState: "idle" | "copied" | "error";
  readonly contextExportStatus: ContextExportStatus;
  readonly pendingCount: number;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClear: () => void;
  readonly onCopyAgentPrompt: () => void;
  readonly onCopyContextJson: () => void;
  readonly onCopyContextMarkdown: () => void;
  readonly onDownloadContextJson: () => void;
  readonly onDownloadContextMarkdown: () => void;
}

function exportStatusLabel(status: ContextExportStatus): string {
  switch (status) {
    case "idle":
      return "";
    case "copied-json":
      return "JSON copied";
    case "copied-md":
      return "Markdown copied";
    case "downloaded-json":
      return "JSON downloaded";
    case "downloaded-md":
      return "Markdown downloaded";
    case "error":
      return "Export failed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function JournalToolbar({
  canUndo,
  canRedo,
  canCopyAgentPrompt,
  agentPromptCopyState,
  contextExportStatus,
  pendingCount,
  onUndo,
  onRedo,
  onClear,
  onCopyAgentPrompt,
  onCopyContextJson,
  onCopyContextMarkdown,
  onDownloadContextJson,
  onDownloadContextMarkdown,
}: JournalToolbarProps): ReactElement {
  const transactionStatus = pendingCount > 0 ? `${pendingCount} pending` : "idle";
  const promptStatus =
    agentPromptCopyState === "copied"
      ? "Agent prompt copied"
      : agentPromptCopyState === "error"
        ? "Copy failed"
        : "";
  const exportStatus = exportStatusLabel(contextExportStatus);

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
        <button
          type="button"
          className="journal-toolbar__button"
          onClick={onCopyContextJson}
          aria-label="Copy context as JSON"
          data-testid="copy-context-json"
        >
          Copy JSON
        </button>
        <button
          type="button"
          className="journal-toolbar__button"
          onClick={onCopyContextMarkdown}
          aria-label="Copy context as Markdown"
          data-testid="copy-context-markdown"
        >
          Copy Markdown
        </button>
        <button
          type="button"
          className="journal-toolbar__button"
          onClick={onDownloadContextJson}
          aria-label="Download context as JSON"
          data-testid="download-context-json"
        >
          Download JSON
        </button>
        <button
          type="button"
          className="journal-toolbar__button"
          onClick={onDownloadContextMarkdown}
          aria-label="Download context as Markdown"
          data-testid="download-context-markdown"
        >
          Download Markdown
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
        <span
          className="journal-toolbar__export-status"
          data-state={contextExportStatus}
          data-testid="context-export-status"
          aria-live="polite"
        >
          {exportStatus}
        </span>
      </div>
    </div>
  );
}
