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
import { useCallback, useMemo, useState } from "react";

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
  try {
    const tx = engine.beginTransaction();
    tx.begin();
    tx.apply(operation);
    tx.commit();
    return true;
  } catch {
    return false;
  }
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
  const [sequence, setSequence] = useState(0);

  const record = useCallback(
    (operation: Operation): JournalEntry => {
      const id = newId();
      const transactionId = newId();
      const seq = sequence;
      setSequence((n) => n + 1);
      const committed =
        previewEngine !== null && previewEngine !== undefined
          ? applyCommitted(previewEngine, operation)
          : false;
      const built = createJournalEntry({
        id,
        changeSetId,
        transactionId,
        sequence: seq,
        actor: "human",
        operation,
        status: committed ? "committed" : "preview",
      });
      setJournal((current) => appendEntry(current, built));
      return built;
    },
    [previewEngine, changeSetId, sequence],
  );

  const commitEntry = useCallback((entryId: string): void => {
    setJournal((current) => markEntryCommitted(current, entryId));
  }, []);

  const undo = useCallback((): void => {
    setJournal((current) => {
      if (!canUndoJournal(current)) return current;
      const { journal: next, inverse } = undoEntry(current);
      if (dispatchOperation !== undefined) {
        dispatchOperation(inverse);
      } else if (previewEngine !== null && previewEngine !== undefined) {
        applyCommitted(previewEngine, inverse);
      }
      return next;
    });
  }, [previewEngine, dispatchOperation]);

  const redo = useCallback((): void => {
    setJournal((current) => {
      if (!canRedoJournal(current)) return current;
      const { journal: next, operation } = redoEntry(current);
      if (dispatchOperation !== undefined) {
        dispatchOperation(operation);
      } else if (previewEngine !== null && previewEngine !== undefined) {
        applyCommitted(previewEngine, operation);
      }
      return next;
    });
  }, [previewEngine, dispatchOperation]);

  const clear = useCallback((): void => {
    if (dispatchClear !== undefined) {
      dispatchClear();
    } else if (previewEngine !== null && previewEngine !== undefined) {
      previewEngine.clearAll();
    }
    setJournal(clearJournal());
  }, [previewEngine, dispatchClear]);

  const replaceJournal = useCallback((next: Journal): void => {
    setJournal(next);
  }, []);

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
    commitEntry,
    undo,
    redo,
    clear,
    replaceJournal,
  };
}
