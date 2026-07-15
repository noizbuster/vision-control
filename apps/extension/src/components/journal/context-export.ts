/**
 * Panel-local VisionContextSnapshot export (JSON + Markdown).
 *
 * Pure data path: selection + journal → compileVisionContextSnapshot (always
 * redacted) → render. No MCP, daemon, or network. Works unpaired.
 */

import type { Operation } from "@vision-control/change-ir";
import type { Journal, JournalEntry } from "@vision-control/change-journal";
import {
  type CompileSnapshotInputs,
  compileVisionContextSnapshot,
  type JournalSummary,
  type MapOrigin,
  type OperationSummary,
  type OperationSummaryKind,
  projectSelectionToTarget,
  renderSnapshotJson,
  renderSnapshotMarkdown,
  summarizeOperation,
  type VisionContextSnapshot,
  VisionContextSnapshotSchema,
} from "@vision-control/context-compiler";
import type { SelectionSummary } from "@vision-control/inspector-core";

const RECENT_KINDS_LIMIT = 12;

/** Inputs available in the DevTools panel without an agent pair. */
export interface PanelContextExportInput {
  readonly selection: SelectionSummary | null;
  readonly journal: Journal;
  /** Opaque tab id when known. */
  readonly tabId?: string;
  /** Opaque session id when known. */
  readonly sessionId?: string;
  /**
   * Monotonic revision for this tab. Caller owns incrementing for MCP push;
   * local export may pass a stable or incrementing value.
   */
  readonly snapshotRev?: number;
  /** Map origins when available (task 12); empty is valid. */
  readonly origins?: readonly MapOrigin[];
  readonly originsTruncated?: boolean;
  /** Epoch-ms compile timestamp (default `Date.now()`). */
  readonly compiledAt?: number;
}

/** Redacted snapshot plus rendered export strings. */
export interface PanelContextExport {
  readonly snapshot: VisionContextSnapshot;
  readonly json: string;
  readonly markdown: string;
}

/**
 * Build a redacted portable snapshot and render JSON + Markdown for panel
 * copy/download. Does not call MCP or the daemon.
 */
export function buildPanelContextExport(input: PanelContextExportInput): PanelContextExport {
  const snapshot = compileVisionContextSnapshot(toCompileInputs(input));
  // Schema check is a development-time contract; product path trusts compile.
  VisionContextSnapshotSchema.parse(snapshot);
  return {
    snapshot,
    json: renderSnapshotJson(snapshot),
    markdown: renderSnapshotMarkdown(snapshot),
  };
}

const toCompileInputs = (input: PanelContextExportInput): CompileSnapshotInputs => {
  const sorted = sortedEntries(input.journal.entries);
  const operations = sorted.map((entry) => safeSummarize(entry.operation));
  const changesetId = sorted[0]?.changeSetId;

  return {
    snapshotRev: input.snapshotRev ?? 0,
    ...(input.tabId !== undefined ? { tabId: input.tabId } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.compiledAt !== undefined ? { compiledAt: input.compiledAt } : {}),
    ...(input.selection !== null ? { selection: projectSelectionToTarget(input.selection) } : {}),
    ...(changesetId !== undefined ? { changesetId } : {}),
    operations,
    journal: summarizeJournal(input.journal, sorted),
    ...(input.origins !== undefined ? { origins: input.origins } : {}),
    ...(input.originsTruncated !== undefined ? { originsTruncated: input.originsTruncated } : {}),
  };
};

const sortedEntries = (entries: readonly JournalEntry[]): readonly JournalEntry[] =>
  [...entries].sort((left, right) => left.sequence - right.sequence);

const summarizeJournal = (journal: Journal, sorted: readonly JournalEntry[]): JournalSummary => {
  const recentKinds = sorted.slice(-RECENT_KINDS_LIMIT).map((entry) => entry.operation.kind);
  return {
    entryCount: journal.entries.length,
    canUndo: journal.stacks.undo.length > 0,
    canRedo: journal.stacks.redo.length > 0,
    undoDepth: journal.stacks.undo.length,
    redoDepth: journal.stacks.redo.length,
    recentKinds,
  };
};

/**
 * Reduce an IR operation to an agent-facing summary. Unimplemented kinds fall
 * back to a minimal row so export never fails on a single op.
 */
const safeSummarize = (operation: Operation): OperationSummary => {
  try {
    return summarizeOperation(operation);
  } catch {
    return {
      id: operation.id,
      kind: operation.kind as OperationSummaryKind,
      runtime: operation.runtime,
      description: `${operation.kind} (summary pending)`,
      detail: {},
    };
  }
};
