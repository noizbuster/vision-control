/**
 * C1 (ADR-019): background-owned tab journal storage keys.
 * Session storage only — never chrome.storage.local.
 */

export const JOURNAL_KEY_PREFIX = "journal:v1:" as const;

export function journalStorageKey(tabId: number): string {
  return `${JOURNAL_KEY_PREFIX}${tabId}`;
}

export function parseJournalStorageKey(key: string): number | undefined {
  if (!key.startsWith(JOURNAL_KEY_PREFIX)) {
    return undefined;
  }
  const raw = key.slice(JOURNAL_KEY_PREFIX.length);
  const tabId = Number.parseInt(raw, 10);
  if (!Number.isFinite(tabId) || String(tabId) !== raw) {
    return undefined;
  }
  return tabId;
}
