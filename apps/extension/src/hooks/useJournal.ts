import type { Operation } from "@vision-control/change-ir";
import {
  appendEntry,
  canRedoJournal,
  canUndoJournal,
  clear as clearJournal,
  createJournal,
  createJournalEntry,
  type Journal,
  type JournalEntry,
  markEntryCommitted,
  redo as redoEntry,
  undo as undoEntry,
} from "@vision-control/change-journal";
import type { PreviewManager } from "@vision-control/preview-engine";
import { useCallback, useMemo, useRef, useState } from "react";

import type { ConnectionState } from "../messaging/index.js";

export interface UseJournalOptions {
  readonly previewEngine?: PreviewManager | null;
  readonly connectionState?: ConnectionState;
  readonly dispatchOperation?: (operation: Operation) => void;
  readonly dispatchClear?: () => void;
}

export interface UseJournalResult {
  readonly journal: Journal;
  readonly entries: readonly JournalEntry[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly pendingCount: number;
  readonly isConnected: boolean;
  readonly record: (operation: Operation) => JournalEntry;
  readonly recordRemote: (operation: Operation) => JournalEntry;
  readonly commitEntry: (entryId: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly clear: () => void;
  readonly replaceJournal: (next: Journal) => void;
}

const newId = (): string => globalThis.crypto.randomUUID();

/**
 * Run a single operation as a committed preview transaction. Returns true only
 * when the transaction reached commit — the signal the journal uses to mark an
 * entry "committed". Any failure leaves the entry "preview" (commit unknown),
 * honouring the commit-status contract.
 */
function applyCommitted(engine: PreviewManager, operation: Operation): boolean {
  const tx = engine.beginTransaction();
  try {
    tx.begin();
    tx.apply(operation);
    tx.commit();
    return true;
  } catch {
    if (tx.state === "applying" || tx.state === "applied") {
      tx.rollback();
    }
    return false;
  }
}

function indexEntriesByOperationId(journal: Journal): Map<string, JournalEntry> {
  const entriesByOperationId = new Map<string, JournalEntry>();
  for (const entry of journal.entries) {
    entriesByOperationId.set(entry.operation.id, entry);
  }
  return entriesByOperationId;
}

function nextSequenceFor(journal: Journal): number {
  let nextSequence = 0;
  for (const entry of journal.entries) {
    nextSequence = Math.max(nextSequence, entry.sequence + 1);
  }
  return nextSequence;
}

export function useJournal(options: UseJournalOptions = {}): UseJournalResult {
  const {
    previewEngine = null,
    connectionState = "disconnected",
    dispatchOperation,
    dispatchClear,
  } = options;
  const [journal, setJournal] = useState<Journal>(createJournal);
  const [changeSetId] = useState<string>(newId);
  const nextSequenceRef = useRef(0);
  const entryByOperationIdRef = useRef<Map<string, JournalEntry>>(new Map());

  const syncJournalRefs = useCallback((next: Journal): void => {
    entryByOperationIdRef.current = indexEntriesByOperationId(next);
    nextSequenceRef.current = nextSequenceFor(next);
  }, []);

  const appendOperation = useCallback(
    (operation: Operation, status: JournalEntry["status"]): JournalEntry => {
      const existing = entryByOperationIdRef.current.get(operation.id);
      if (existing !== undefined) return existing;

      const built = createJournalEntry({
        id: newId(),
        changeSetId,
        transactionId: newId(),
        sequence: nextSequenceRef.current,
        actor: "human",
        operation,
        status,
      });
      entryByOperationIdRef.current.set(operation.id, built);
      nextSequenceRef.current += 1;
      setJournal((current) => {
        const next = appendEntry(current, built);
        syncJournalRefs(next);
        return next;
      });
      return built;
    },
    [changeSetId, syncJournalRefs],
  );

  const record = useCallback(
    (operation: Operation): JournalEntry => {
      const existing = entryByOperationIdRef.current.get(operation.id);
      if (existing !== undefined) return existing;

      const committed =
        previewEngine !== null && previewEngine !== undefined
          ? applyCommitted(previewEngine, operation)
          : false;
      return appendOperation(operation, committed ? "committed" : "preview");
    },
    [previewEngine, appendOperation],
  );

  const commitEntry = useCallback(
    (entryId: string): void => {
      setJournal((current) => {
        const next = markEntryCommitted(current, entryId);
        syncJournalRefs(next);
        return next;
      });
    },
    [syncJournalRefs],
  );

  const recordRemote = useCallback(
    (operation: Operation): JournalEntry => {
      const existing = entryByOperationIdRef.current.get(operation.id);
      if (existing !== undefined) {
        if (existing.status !== "preview") return existing;

        const committed: JournalEntry = { ...existing, status: "committed" };
        entryByOperationIdRef.current.set(operation.id, committed);
        setJournal((current) => {
          const next = markEntryCommitted(current, existing.id);
          syncJournalRefs(next);
          return next;
        });
        return committed;
      }

      return appendOperation(operation, "committed");
    },
    [appendOperation, syncJournalRefs],
  );

  const undo = useCallback((): void => {
    setJournal((current) => {
      if (!canUndoJournal(current)) return current;
      const { journal: next, inverse } = undoEntry(current);
      if (dispatchOperation !== undefined) {
        dispatchOperation(inverse);
      } else if (previewEngine !== null && previewEngine !== undefined) {
        if (!applyCommitted(previewEngine, inverse)) return current;
      }
      syncJournalRefs(next);
      return next;
    });
  }, [previewEngine, dispatchOperation, syncJournalRefs]);

  const redo = useCallback((): void => {
    setJournal((current) => {
      if (!canRedoJournal(current)) return current;
      const { journal: next, operation } = redoEntry(current);
      if (dispatchOperation !== undefined) {
        dispatchOperation(operation);
      } else if (previewEngine !== null && previewEngine !== undefined) {
        if (!applyCommitted(previewEngine, operation)) return current;
      }
      syncJournalRefs(next);
      return next;
    });
  }, [previewEngine, dispatchOperation, syncJournalRefs]);

  const clear = useCallback((): void => {
    if (dispatchClear !== undefined) {
      dispatchClear();
    } else if (previewEngine !== null && previewEngine !== undefined) {
      previewEngine.clearAll();
    }
    const next = clearJournal();
    syncJournalRefs(next);
    setJournal(next);
  }, [previewEngine, dispatchClear, syncJournalRefs]);

  const replaceJournal = useCallback(
    (next: Journal): void => {
      syncJournalRefs(next);
      setJournal(next);
    },
    [syncJournalRefs],
  );

  const entries = useMemo<readonly JournalEntry[]>(
    () => [...journal.entries].reverse(),
    [journal.entries],
  );

  const pendingCount = useMemo(
    () => journal.entries.filter((e) => e.status === "preview").length,
    [journal.entries],
  );

  return {
    journal,
    entries,
    canUndo: canUndoJournal(journal),
    canRedo: canRedoJournal(journal),
    pendingCount,
    isConnected: connectionState === "connected",
    record,
    recordRemote,
    commitEntry,
    undo,
    redo,
    clear,
    replaceJournal,
  };
}
