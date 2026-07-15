/**
 * Background-owned tab journal store (ADR-019 C1).
 *
 * Sole writer to chrome.storage.session keys `journal:v1:${tabId}`.
 * Panel and content must never call storage for these keys; they mutate via bus.
 */

import {
  createJournal,
  deserializeJournal,
  type Journal,
  serializeJournal,
} from "@vision-control/change-journal";

import { journalStorageKey, parseJournalStorageKey } from "./session-journal-keys.js";

export interface SessionJournalStoreOptions {
  readonly storage?: chrome.storage.StorageArea;
}

export class SessionJournalStore {
  private readonly storage: chrome.storage.StorageArea | undefined;
  private readonly journals = new Map<number, Journal>();

  constructor(options: SessionJournalStoreOptions = {}) {
    this.storage = options.storage;
  }

  get(tabId: number): Journal {
    return this.journals.get(tabId) ?? createJournal();
  }

  has(tabId: number): boolean {
    return this.journals.has(tabId);
  }

  async set(tabId: number, journal: Journal): Promise<void> {
    this.journals.set(tabId, journal);
    if (this.storage === undefined) {
      return;
    }
    const key = journalStorageKey(tabId);
    await this.storage.set({ [key]: serializeJournal(journal) });
  }

  async remove(tabId: number): Promise<void> {
    this.journals.delete(tabId);
    if (this.storage === undefined) {
      return;
    }
    await this.storage.remove(journalStorageKey(tabId));
  }

  async restore(): Promise<void> {
    if (this.storage === undefined) {
      return;
    }
    const stored = await this.storage.get(null);
    this.journals.clear();
    for (const [key, value] of Object.entries(stored)) {
      const tabId = parseJournalStorageKey(key);
      if (tabId === undefined) {
        continue;
      }
      if (typeof value !== "string") {
        continue;
      }
      const parsed = deserializeJournal(value);
      if (parsed.success) {
        this.journals.set(tabId, parsed.data);
      }
    }
  }

  tabIds(): readonly number[] {
    return [...this.journals.keys()];
  }
}
