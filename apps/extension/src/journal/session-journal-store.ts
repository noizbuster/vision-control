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
  readonly storage?: SessionJournalStorage;
  readonly onTaskError?: (error: unknown) => void;
}

export interface SessionJournalStorage {
  readonly get: (keys: null) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}

export class SessionJournalStore {
  private readonly storage: SessionJournalStorage | undefined;
  private readonly onTaskError: ((error: unknown) => void) | undefined;
  private readonly journals = new Map<number, Journal>();
  private taskQueue: Promise<void> = Promise.resolve();
  private queuedTaskCount = 0;

  constructor(options: SessionJournalStoreOptions = {}) {
    this.storage = options.storage;
    this.onTaskError = options.onTaskError;
  }

  runWhenReady(task: () => void | Promise<void>): void {
    void this.enqueueTask(task);
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

  restore(): Promise<void> {
    return this.enqueueTask(async () => {
      if (this.storage === undefined) {
        return;
      }
      const stored = await this.storage.get(null);
      this.journals.clear();
      for (const [key, value] of Object.entries(stored)) {
        const tabId = parseJournalStorageKey(key);
        if (tabId === undefined || typeof value !== "string") {
          continue;
        }
        const parsed = deserializeJournal(value);
        if (parsed.success) {
          this.journals.set(tabId, parsed.data);
        }
      }
    });
  }

  private enqueueTask(task: () => void | Promise<void>): Promise<void> {
    this.queuedTaskCount += 1;
    if (this.queuedTaskCount === 1) {
      let resolveTask = (): void => {};
      let rejectTask = (_error: unknown): void => {};
      const completion = new Promise<void>((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
      });
      this.taskQueue = completion.finally(() => {
        this.queuedTaskCount -= 1;
      });
      void this.executeTask(task).then(resolveTask, rejectTask);
      return this.taskQueue;
    }

    this.taskQueue = this.taskQueue
      .then(() => this.executeTask(task))
      .finally(() => {
        this.queuedTaskCount -= 1;
      });
    return this.taskQueue;
  }

  private async executeTask(task: () => void | Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      if (this.onTaskError === undefined) {
        throw error;
      }
      this.onTaskError(error);
    }
  }

  tabIds(): readonly number[] {
    return [...this.journals.keys()];
  }
}
