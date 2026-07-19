/**
 * MCP projection cache (ADR-020).
 *
 * Holds the last ingested extension snapshot per tab. Never invents selection
 * or journal state. Closed tabs are cleared so tools cannot return stale data.
 */

import type { VisionContextSnapshot } from "@vision-control/context-compiler";

/** Max gap without session.heartbeat before the pair is treated as disconnected (C8). */
export const HEARTBEAT_MAX_GAP_MS = 15_000;
const MAX_RETIRED_SESSIONS_PER_TAB = 64;

export interface ProjectionEntry {
  readonly tabId: string;
  readonly sessionId: string | undefined;
  readonly snapshotRev: number;
  readonly snapshot: VisionContextSnapshot;
  readonly ingestedAt: number;
}

/** Content-owned verification result projected for MCP tools (ADR-019 C6). */
export interface ProjectedVerificationResult {
  readonly tabId: string;
  readonly sessionId: string | undefined;
  readonly ts: number;
  readonly passed: boolean;
  readonly details: unknown;
  readonly commandId: string | undefined;
}

export interface ProjectionCacheState {
  /** Last snapshot per tabId. */
  readonly byTab: ReadonlyMap<string, ProjectionEntry>;
  /** Active last-focused tab, or last-pushed bootstrap before the first focus fact. */
  readonly activeTabId: string | undefined;
  /** Whether a bridge socket is currently paired. */
  readonly paired: boolean;
  /** Epoch-ms of last session.heartbeat from the extension. */
  readonly lastHeartbeatAt: number | undefined;
  /** Last verification.result per tab (never invented when unpaired). */
  readonly verificationByTab: ReadonlyMap<string, ProjectedVerificationResult>;
}

export interface ProjectionCache {
  /** Ingest a validated snapshot push. Stale (lower) revs for the same tab are ignored. */
  ingest(entry: ProjectionEntry): boolean;
  /** Store a result only when it belongs to the current tab session generation (C6). */
  setVerificationResult(result: ProjectedVerificationResult): boolean;
  getVerificationResult(tabId?: string): ProjectedVerificationResult | undefined;
  /** Remove a tab's projection (tab closed). */
  clearTab(tabId: string, sessionId: string | undefined): boolean;
  /** Clear all projections (disconnect / unpair). */
  clearAll(): void;
  markPaired(now: number): void;
  markUnpaired(): void;
  noteHeartbeat(now: number): void;
  setActiveTab(tabId: string, sessionId: string | undefined): boolean;
  getActive(): ProjectionEntry | undefined;
  getByTab(tabId: string): ProjectionEntry | undefined;
  /**
   * True when paired and heartbeat is fresh (or just paired with no gap yet).
   * When false, tools must return not_paired / empty — never stale success.
   */
  isLive(now: number): boolean;
  snapshot(): ProjectionCacheState;
}

interface FocusedGeneration {
  readonly tabId: string;
  readonly sessionId: string | undefined;
}

export function createProjectionCache(options?: {
  readonly heartbeatMaxGapMs?: number;
}): ProjectionCache {
  const heartbeatMaxGapMs = options?.heartbeatMaxGapMs ?? HEARTBEAT_MAX_GAP_MS;
  const byTab = new Map<string, ProjectionEntry>();
  const verificationByTab = new Map<string, ProjectedVerificationResult>();
  const retiredSessionsByTab = new Map<string, Set<string | undefined>>();
  let activeTabId: string | undefined;
  let focusedGeneration: FocusedGeneration | undefined;
  let paired = false;
  let lastHeartbeatAt: number | undefined;

  const retireSession = (tabId: string, sessionId: string | undefined): boolean => {
    const retired = retiredSessionsByTab.get(tabId) ?? new Set<string | undefined>();
    if (!retired.has(sessionId) && retired.size >= MAX_RETIRED_SESSIONS_PER_TAB) {
      return false;
    }
    retired.add(sessionId);
    retiredSessionsByTab.set(tabId, retired);
    return true;
  };

  return {
    ingest(entry: ProjectionEntry): boolean {
      if (entry.snapshot.sessionId !== undefined && entry.snapshot.sessionId !== entry.sessionId) {
        return false;
      }
      const existing = byTab.get(entry.tabId);
      const retired = retiredSessionsByTab.get(entry.tabId);
      if (
        (entry.sessionId === undefined && retired !== undefined && retired.size > 0) ||
        (entry.sessionId !== undefined &&
          (retired?.has(entry.sessionId) === true ||
            (existing === undefined &&
              retired !== undefined &&
              retired.size >= MAX_RETIRED_SESSIONS_PER_TAB)))
      ) {
        return false;
      }
      const sameSession = existing?.sessionId === entry.sessionId;
      if (existing !== undefined && sameSession && entry.snapshotRev < existing.snapshotRev) {
        return false;
      }
      if (existing !== undefined && !sameSession) {
        if (entry.sessionId === undefined) {
          return false;
        }
        if (!retireSession(entry.tabId, existing.sessionId)) {
          return false;
        }
        verificationByTab.delete(entry.tabId);
      } else if (
        existing !== undefined &&
        sameSession &&
        entry.snapshotRev > existing.snapshotRev
      ) {
        verificationByTab.delete(entry.tabId);
      }
      byTab.set(entry.tabId, entry);
      if (focusedGeneration === undefined) activeTabId = entry.tabId;
      return true;
    },

    setVerificationResult(result: ProjectedVerificationResult): boolean {
      if (!Number.isSafeInteger(result.ts) || result.ts < 0) {
        return false;
      }
      const current = byTab.get(result.tabId);
      if (
        current?.sessionId === undefined ||
        result.sessionId === undefined ||
        current.sessionId !== result.sessionId
      ) {
        return false;
      }
      const existing = verificationByTab.get(result.tabId);
      if (existing !== undefined && result.ts <= existing.ts) {
        return false;
      }
      verificationByTab.set(result.tabId, result);
      return true;
    },

    getVerificationResult(tabId?: string): ProjectedVerificationResult | undefined {
      if (tabId === undefined && focusedGeneration !== undefined) {
        const focused = verificationByTab.get(focusedGeneration.tabId);
        return focused?.sessionId === focusedGeneration.sessionId ? focused : undefined;
      }
      const key = tabId ?? activeTabId;
      if (key === undefined) return undefined;
      return verificationByTab.get(key);
    },

    clearTab(tabId: string, sessionId: string | undefined): boolean {
      const current = byTab.get(tabId);
      const currentMatches = current !== undefined && current.sessionId === sessionId;
      const focusedMatches =
        focusedGeneration?.tabId === tabId && focusedGeneration.sessionId === sessionId;
      const closesRetiredGeneration = retiredSessionsByTab.get(tabId)?.has(sessionId) === true;
      const preservesReplacement = focusedMatches && !currentMatches && closesRetiredGeneration;
      if (!currentMatches && !focusedMatches) {
        return false;
      }
      if (currentMatches || (focusedMatches && !preservesReplacement)) {
        byTab.delete(tabId);
        verificationByTab.delete(tabId);
      }
      if (
        focusedMatches &&
        !preservesReplacement &&
        current?.sessionId !== undefined &&
        current.sessionId !== sessionId
      ) {
        retireSession(tabId, current.sessionId);
      }
      retireSession(tabId, sessionId);
      if (focusedMatches) {
        const fallback = [...byTab.values()].find((entry) => entry.tabId !== tabId);
        activeTabId = fallback?.tabId;
        if (fallback !== undefined) {
          focusedGeneration = { tabId: fallback.tabId, sessionId: fallback.sessionId };
        }
      } else if (focusedGeneration === undefined && activeTabId === tabId) {
        activeTabId = byTab.values().next().value?.tabId;
      }
      return true;
    },

    clearAll(): void {
      byTab.clear();
      verificationByTab.clear();
      retiredSessionsByTab.clear();
      activeTabId = undefined;
      focusedGeneration = undefined;
    },

    markPaired(now: number): void {
      paired = true;
      lastHeartbeatAt = now;
    },

    markUnpaired(): void {
      paired = false;
      lastHeartbeatAt = undefined;
      byTab.clear();
      verificationByTab.clear();
      retiredSessionsByTab.clear();
      activeTabId = undefined;
      focusedGeneration = undefined;
    },

    noteHeartbeat(now: number): void {
      lastHeartbeatAt = now;
    },

    setActiveTab(tabId: string, sessionId: string | undefined): boolean {
      const current = byTab.get(tabId);
      if (current !== undefined) {
        if (current.sessionId !== sessionId) {
          return false;
        }
      } else if (
        sessionId === undefined ||
        retiredSessionsByTab.get(tabId)?.has(sessionId) === true ||
        (retiredSessionsByTab.get(tabId)?.size ?? 0) >= MAX_RETIRED_SESSIONS_PER_TAB
      ) {
        return false;
      }
      activeTabId = tabId;
      focusedGeneration = { tabId, sessionId };
      return true;
    },

    getActive(): ProjectionEntry | undefined {
      if (focusedGeneration !== undefined) {
        const focused = byTab.get(focusedGeneration.tabId);
        return focused?.sessionId === focusedGeneration.sessionId ? focused : undefined;
      }
      if (activeTabId === undefined) return undefined;
      return byTab.get(activeTabId);
    },

    getByTab(tabId: string): ProjectionEntry | undefined {
      return byTab.get(tabId);
    },

    isLive(now: number): boolean {
      if (!paired) return false;
      if (lastHeartbeatAt === undefined) return false;
      return now - lastHeartbeatAt <= heartbeatMaxGapMs;
    },

    snapshot(): ProjectionCacheState {
      return {
        byTab: new Map(byTab),
        activeTabId,
        paired,
        lastHeartbeatAt,
        verificationByTab: new Map(verificationByTab),
      };
    },
  };
}
