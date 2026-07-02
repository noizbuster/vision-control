import type { Operation } from "@vision-control/change-ir";
import type { JournalEntryStatus } from "@vision-control/change-journal";
import type { ReactElement } from "react";

import { BeforeAfterSummary, operationLabel } from "./BeforeAfterSummary.js";

interface JournalEntryViewProps {
  readonly id: string;
  readonly operation: Operation;
  readonly status: JournalEntryStatus;
  readonly appliedAt: number;
  readonly now?: number;
}

const STATUS_CLASS: Record<JournalEntryStatus, string> = {
  pending: "journal-status journal-status--pending",
  committed: "journal-status journal-status--committed",
  "rolled-back": "journal-status journal-status--rolled-back",
};

const STATUS_LABEL: Record<JournalEntryStatus, string> = {
  pending: "pending",
  committed: "committed",
  "rolled-back": "rolled-back",
};

export function formatTimestamp(appliedAt: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - appliedAt);
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1000)}s ago`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  return new Date(appliedAt).toLocaleTimeString();
}

export function JournalEntryView({
  id,
  operation,
  status,
  appliedAt,
  now,
}: JournalEntryViewProps): ReactElement {
  return (
    <li className="journal-entry" data-entry-id={id} data-status={status}>
      <span className="journal-entry__icon">{operationLabel(operation)}</span>
      <div className="journal-entry__body">
        <BeforeAfterSummary operation={operation} />
        <span className="journal-entry__meta">
          <span className={STATUS_CLASS[status]} data-testid="journal-status-badge">
            {STATUS_LABEL[status]}
          </span>
          <time className="journal-entry__time" dateTime={new Date(appliedAt).toISOString()}>
            {formatTimestamp(appliedAt, now)}
          </time>
        </span>
      </div>
    </li>
  );
}
