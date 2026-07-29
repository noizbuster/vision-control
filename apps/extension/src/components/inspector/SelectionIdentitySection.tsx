import type { SelectionSummary } from "@vision-control/inspector-core";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";

import { SourceConfidence } from "./SourceConfidence.js";

export type SelectionCopyStatus = "idle" | "resolving" | "copied" | "error";

const MAX_SELECTOR_DISPLAY_LENGTH = 32;

type SelectorCopyStatus = "idle" | "copied" | "error";

function truncateSelector(selector: string): string {
  const characters = Array.from(selector);
  if (characters.length <= MAX_SELECTOR_DISPLAY_LENGTH) return selector;

  const visibleLength = MAX_SELECTOR_DISPLAY_LENGTH - 1;
  const prefixLength = Math.ceil(visibleLength / 2);
  const suffixLength = Math.floor(visibleLength / 2);
  return `${characters.slice(0, prefixLength).join("")}…${characters
    .slice(-suffixLength)
    .join("")}`;
}

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

function selectorCopyStatusLabel(status: SelectorCopyStatus): string {
  switch (status) {
    case "idle":
      return "";
    case "copied":
      return "Selector copied";
    case "error":
      return "Selector copy failed";
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
  const selector = summary.identity.selector ?? null;
  const canCopySelector = selector !== null && selector.length > 0;
  const [selectorCopyStatus, setSelectorCopyStatus] = useState<SelectorCopyStatus>("idle");
  const selectorCopyAttemptRef = useRef(0);

  useEffect(() => {
    selectorCopyAttemptRef.current += 1;
    setSelectorCopyStatus("idle");
  }, [selector]);

  const handleCopySelector = useCallback((): void => {
    if (!canCopySelector || selector === null) return;

    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      selectorCopyAttemptRef.current += 1;
      setSelectorCopyStatus("error");
      return;
    }

    const attempt = selectorCopyAttemptRef.current + 1;
    selectorCopyAttemptRef.current = attempt;
    void clipboard.writeText(selector).then(
      () => {
        if (selectorCopyAttemptRef.current !== attempt) return;
        setSelectorCopyStatus("copied");
      },
      () => {
        if (selectorCopyAttemptRef.current !== attempt) return;
        setSelectorCopyStatus("error");
      },
    );
  }, [canCopySelector, selector]);

  return (
    <div className="inspector-semantic">
      <div className="inspector-semantic__row">
        <span className="inspector-semantic__label">Selector</span>
        <span
          className="inspector-semantic__value inspector-selection-selector"
          title={selector ?? undefined}
        >
          {selector === null ? (
            "none"
          ) : (
            <>
              <span aria-hidden="true">{truncateSelector(selector)}</span>
              <span className="inspector-selection-selector__full">{selector}</span>
            </>
          )}
        </span>
        <div className="inspector-selection-actions">
          <button
            type="button"
            className="inspector-selection-copy"
            onClick={onCopySelectionContext}
            disabled={!canCopySelectionContext}
            aria-label="Copy for agent"
          >
            Copy for agent
          </button>
          <button
            type="button"
            className="inspector-selection-copy"
            onClick={handleCopySelector}
            disabled={!canCopySelector}
            aria-label="Copy selector"
          >
            Copy selector
          </button>
        </div>
      </div>
      <p
        className="inspector-selection-copy__status"
        data-testid="selection-copy-status"
        aria-live="polite"
      >
        {selectionCopyStatusLabel(selectionCopyStatus)}
      </p>
      {selectorCopyStatus !== "idle" && (
        <p
          className="inspector-selection-copy__status"
          data-testid="selector-copy-status"
          aria-live="polite"
        >
          {selectorCopyStatusLabel(selectorCopyStatus)}
        </p>
      )}
      <div className="inspector-semantic__row">
        <span className="inspector-semantic__label">Confidence</span>
        <SourceConfidence confidence={summary.sourceConfidence} />
      </div>
    </div>
  );
}
