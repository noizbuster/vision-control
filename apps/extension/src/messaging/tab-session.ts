import type { FrameInfo, TabSession } from "./types.js";

const STORAGE_KEY = "visionControlSessions";

export interface TabEventHandlers {
  readonly onSessionCreated?: (tabId: number, session: TabSession) => void;
  readonly onSessionUpdated?: (tabId: number, session: TabSession) => void;
  readonly onSessionRemoved?: (tabId: number) => void;
}

export interface TabSessionStoreOptions {
  readonly storage?: chrome.storage.StorageArea;
  readonly generateSessionId?: () => string;
  readonly handlers?: TabEventHandlers;
}

/**
 * In-memory + session-storage registry of per-tab inspection sessions.
 *
 * The background service worker keeps this alive. When a tab reloads the frame
 * tree is rebuilt but the `sessionId` is preserved so the panel reconnects to
 * the same session. When the tab closes the session is removed.
 */
export class TabSessionStore {
  private readonly sessions = new Map<number, TabSession>();
  private readonly storage: chrome.storage.StorageArea | undefined;
  private readonly generateSessionId: () => string;
  private readonly handlers: TabEventHandlers;

  constructor(options: TabSessionStoreOptions = {}) {
    this.storage = options.storage;
    this.generateSessionId = options.generateSessionId ?? defaultGenerateSessionId;
    this.handlers = options.handlers ?? {};
  }

  get(tabId: number): TabSession | undefined {
    return this.sessions.get(tabId);
  }

  ensure(tabId: number): TabSession {
    const existing = this.sessions.get(tabId);
    if (existing !== undefined) {
      return existing;
    }
    const session: TabSession = {
      sessionId: this.generateSessionId(),
      inspected: false,
      frameTree: [],
    };
    this.sessions.set(tabId, session);
    this.handlers.onSessionCreated?.(tabId, session);
    void this.persist();
    return session;
  }

  setInspected(tabId: number, inspected: boolean): void {
    const session = this.ensure(tabId);
    if (session.inspected === inspected) {
      return;
    }
    const updated: TabSession = { ...session, inspected };
    this.sessions.set(tabId, updated);
    this.handlers.onSessionUpdated?.(tabId, updated);
    void this.persist();
  }

  updateFrameTree(tabId: number, frameTree: readonly FrameInfo[]): void {
    const session = this.ensure(tabId);
    const updated: TabSession = { ...session, frameTree };
    this.sessions.set(tabId, updated);
    this.handlers.onSessionUpdated?.(tabId, updated);
    void this.persist();
  }

  resetForReload(tabId: number): void {
    const session = this.sessions.get(tabId);
    if (session === undefined) {
      return;
    }
    const updated: TabSession = {
      sessionId: session.sessionId,
      inspected: session.inspected,
      frameTree: [],
    };
    this.sessions.set(tabId, updated);
    this.handlers.onSessionUpdated?.(tabId, updated);
    void this.persist();
  }

  remove(tabId: number): void {
    if (!this.sessions.has(tabId)) {
      return;
    }
    this.sessions.delete(tabId);
    this.handlers.onSessionRemoved?.(tabId);
    void this.persist();
  }

  entries(): ReadonlyMap<number, TabSession> {
    return this.sessions;
  }

  async restore(): Promise<void> {
    if (this.storage === undefined) {
      return;
    }
    const stored = await this.storage.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    if (raw === undefined || typeof raw !== "object" || raw === null) {
      return;
    }
    const map = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(map)) {
      const tabId = Number.parseInt(key, 10);
      const session = parseStoredSession(value);
      if (session !== undefined && !Number.isNaN(tabId)) {
        this.sessions.set(tabId, session);
      }
    }
  }

  private async persist(): Promise<void> {
    if (this.storage === undefined) {
      return;
    }
    const serialisable: Record<string, TabSession> = {};
    for (const [tabId, session] of this.sessions) {
      serialisable[String(tabId)] = session;
    }
    await this.storage.set({ [STORAGE_KEY]: serialisable });
  }
}

function defaultGenerateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseStoredSession(value: unknown): TabSession | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.sessionId !== "string" ||
    typeof obj.inspected !== "boolean" ||
    !Array.isArray(obj.frameTree)
  ) {
    return undefined;
  }
  return {
    sessionId: obj.sessionId,
    inspected: obj.inspected,
    frameTree: obj.frameTree as FrameInfo[],
  };
}
