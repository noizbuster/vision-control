import type { Journal, JournalDaemonClient, SyncResult } from "@vision-control/change-journal";
import { restoreFromDaemon, syncToDaemon } from "@vision-control/change-journal";
import { useEffect, useRef, useState } from "react";

export interface UseJournalPersistenceOptions {
  readonly journal: Journal;
  readonly client: JournalDaemonClient | null;
  readonly onRestore?: (journal: Journal) => void;
}

export interface UseJournalPersistenceResult {
  readonly lastSync: SyncResult | null;
  readonly isSyncing: boolean;
}

const SYNC_DEBOUNCE_MS = 300;

/**
 * Sync the journal to the daemon while connected (debounced), and restore it
 * from the daemon on connect. When the client is null or disconnected this is a
 * no-op: the journal lives in memory in the panel via {@link useJournal}.
 */
export function useJournalPersistence(
  options: UseJournalPersistenceOptions,
): UseJournalPersistenceResult {
  const { journal, client, onRestore } = options;
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const lastClientStateRef = useRef<string | null>(null);

  const connected = client !== null && client.state === "connected";

  useEffect(() => {
    if (client === null) return;
    const currentState = client.state;
    const previous = lastClientStateRef.current;
    lastClientStateRef.current = currentState;
    if (currentState !== "connected" || previous === "connected") return;

    let cancelled = false;
    setIsSyncing(true);
    restoreFromDaemon(client)
      .then((restored) => {
        if (cancelled || restored === null) return;
        onRestoreRef.current?.(restored);
      })
      .finally(() => {
        if (!cancelled) setIsSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!connected || client === null) return;
    const handle = setTimeout(() => {
      setIsSyncing(true);
      syncToDaemon(journal, client)
        .then((result) => {
          setLastSync(result);
        })
        .finally(() => {
          setIsSyncing(false);
        });
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [journal, client, connected]);

  return { lastSync, isSyncing };
}
