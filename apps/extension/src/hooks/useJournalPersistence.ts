import { createJournal, type Journal } from "@vision-control/change-journal";
import { useEffect, useRef, useState } from "react";

import {
  createJournalReplaceMessage,
  createJournalRequestMessage,
  JOURNAL_STATE_TYPE,
  parseJournalStatePayload,
} from "../journal/journal-messages.js";
import type { MessageBus } from "../messaging/index.js";
import { mergeHydratedJournal } from "./journal-hydration.js";

export interface UseJournalPersistenceOptions {
  readonly journal: Journal;
  readonly tabId: number | null | undefined;
  readonly bus: MessageBus | undefined;
  readonly onRestore?: (journal: Journal) => void;
}

export interface UseJournalPersistenceResult {
  /** True after the first journal-state response for the current tab. */
  readonly isHydrated: boolean;
  readonly isSyncing: boolean;
}

const SYNC_DEBOUNCE_MS = 300;

/**
 * Offline-first journal persistence via the background session store (ADR-019 C1).
 *
 * Panel never writes chrome.storage.session. Mutations go to background as
 * `journal-replace`; rehydrate uses `journal-request` / `journal-state`.
 */
export function useJournalPersistence(
  options: UseJournalPersistenceOptions,
): UseJournalPersistenceResult {
  const { journal, tabId, bus, onRestore } = options;
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const journalRef = useRef(journal);
  journalRef.current = journal;
  const hydratedTabRef = useRef<number | null>(null);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    if (bus === undefined || tabId === undefined || tabId === null) {
      return;
    }

    setIsHydrated(false);
    hydratedTabRef.current = null;

    const unsubscribe = bus.on(JOURNAL_STATE_TYPE, (message) => {
      const payload = parseJournalStatePayload(message.payload);
      if (payload === null || payload.tabId !== tabId) {
        return;
      }
      const merged = mergeHydratedJournal(payload.journal ?? createJournal(), journalRef.current);
      skipNextSyncRef.current = !merged.hasLocalChanges;
      onRestoreRef.current?.(merged.journal);
      hydratedTabRef.current = tabId;
      setIsHydrated(true);
    });

    bus.send("background", createJournalRequestMessage(tabId));

    return () => {
      unsubscribe();
    };
  }, [bus, tabId]);

  useEffect(() => {
    if (bus === undefined || tabId === undefined || tabId === null) {
      return;
    }
    if (!isHydrated || hydratedTabRef.current !== tabId) {
      return;
    }
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    setIsSyncing(true);
    const handle = setTimeout(() => {
      bus.send("background", createJournalReplaceMessage(tabId, journal));
      setIsSyncing(false);
    }, SYNC_DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      setIsSyncing(false);
    };
  }, [bus, tabId, journal, isHydrated]);

  return { isHydrated, isSyncing };
}
