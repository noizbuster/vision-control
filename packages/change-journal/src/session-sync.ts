/**
 * Session persistence for the journal: sync the full journal state to the daemon
 * when connected, and restore it on reconnect. The local fallback when the
 * daemon is unreachable is the journal itself, which the panel keeps in memory.
 *
 * The transport is a narrow structural interface ({@link JournalDaemonClient})
 * that the real `@vision-control/daemon-client` DaemonClient satisfies, so this
 * package stays free of a runtime daemon-client dependency.
 */

import type { Journal } from "./journal.js";
import { deserializeJournal, serializeJournal } from "./persistence.js";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface JournalDaemonMessage {
  readonly messageType: string;
  readonly payload: unknown;
}

/**
 * Minimal transport surface the journal needs from the daemon client. The real
 * `DaemonClient` structurally satisfies this: it exposes `state`, `send`, and
 * `onMessage`. Depending on this narrow interface keeps change-journal decoupled
 * from the daemon-client package at the type level.
 */
export interface JournalDaemonClient {
  readonly state: ConnectionState;
  send(messageType: string, payload: unknown): void;
  onMessage(handler: (message: JournalDaemonMessage) => void): () => void;
}

export type SyncResult =
  | { readonly synced: true; readonly entryCount: number }
  | {
      readonly synced: false;
      readonly reason: "disconnected" | "send-failed";
      readonly message: string;
    };

const JOURNAL_SYNC_TYPE = "journal-sync";
const JOURNAL_RESTORE_REQUEST_TYPE = "journal-restore-request";
const JOURNAL_RESTORE_RESPONSE_TYPE = "journal-restore-response";
const DEFAULT_RESTORE_TIMEOUT_MS = 5000;

/**
 * Sync the full journal to the daemon. When the client is connected, the
 * journal is serialized and sent as a `journal-sync` message. When
 * disconnected, this is a no-op: the journal stays in memory on the panel side
 * and is re-synced on reconnect.
 */
export const syncToDaemon = async (
  journal: Journal,
  client: JournalDaemonClient,
): Promise<SyncResult> => {
  if (client.state !== "connected") {
    return { synced: false, reason: "disconnected", message: "daemon not connected" };
  }
  try {
    client.send(JOURNAL_SYNC_TYPE, serializeJournal(journal));
  } catch (err) {
    return {
      synced: false,
      reason: "send-failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  return { synced: true, entryCount: journal.entries.length };
};

/**
 * Restore the journal from the daemon. Sends a `journal-restore-request` and
 * resolves with the deserialized journal when a `journal-restore-response`
 * arrives, or `null` on timeout, disconnect, or a parse failure.
 */
export const restoreFromDaemon = async (
  client: JournalDaemonClient,
  timeoutMs: number = DEFAULT_RESTORE_TIMEOUT_MS,
): Promise<Journal | null> => {
  if (client.state !== "connected") {
    return null;
  }
  return new Promise<Journal | null>((resolve) => {
    let settled = false;

    const finish = (value: Journal | null): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(value);
    };

    const unsubscribe = client.onMessage((message) => {
      if (message.messageType !== JOURNAL_RESTORE_RESPONSE_TYPE) return;
      const { payload } = message;
      if (typeof payload !== "string") {
        finish(null);
        return;
      }
      const result = deserializeJournal(payload);
      finish(result.success ? result.data : null);
    });

    const timer: ReturnType<typeof setTimeout> = setTimeout(() => finish(null), timeoutMs);

    try {
      client.send(JOURNAL_RESTORE_REQUEST_TYPE, null);
    } catch {
      finish(null);
    }
  });
};
