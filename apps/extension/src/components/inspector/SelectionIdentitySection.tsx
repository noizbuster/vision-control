import type { SelectionSummary } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

import { SourceConfidence } from "./SourceConfidence.js";

export type SelectionCopyStatus = "idle" | "resolving" | "copied" | "error";

interface SelectionIdentitySectionProps {
  readonly summary: SelectionSummary;
  readonly canCopySelectionContext: boolean;
  readonly onCopySelectionContext: (() => void) | undefined;
  readonly selectionCopyStatus: SelectionCopyStatus;
}

function selectionCopyStatusLabel(status: SelectionCopyStatus): string {
  switch (status) {
    case "idle":
      return "";
    case "resolving":
      return "Resolving source hints";
    case "copied":
      return "Selection context copied";
    case "error":
      return "Copy failed";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function SelectionIdentitySection({
  summary,
  canCopySelectionContext,
  onCopySelectionContext,
  selectionCopyStatus,
}: SelectionIdentitySectionProps): ReactElement {
  return (
    <div className="inspector-semantic">
      <div className="inspector-semantic__row">
        <span className="inspector-semantic__label">Selector</span>
        <span className="inspector-semantic__value">{summary.identity.selector ?? "none"}</span>
        <button
          type="button"
          className="inspector-selection-copy"
          onClick={onCopySelectionContext}
          disabled={!canCopySelectionContext}
          aria-label="Copy for agent"
        >
          Copy for agent
        </button>
      </div>
      <p
        className="inspector-selection-copy__status"
        data-testid="selection-copy-status"
        aria-live="polite"
      >
        {selectionCopyStatusLabel(selectionCopyStatus)}
      </p>
      <div className="inspector-semantic__row">
        <span className="inspector-semantic__label">Confidence</span>
        <SourceConfidence confidence={summary.sourceConfidence} />
      </div>
    </div>
  );
}
