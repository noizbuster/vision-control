/**
 * MCP projection cache (ADR-020).
 *
 * Holds the last ingested extension snapshot per tab. Never invents selection
 * or journal state. Closed tabs are cleared so tools cannot return stale data.
 */

import type { VisionContextSnapshot } from "@vision-control/context-compiler";

/** Max gap without session.heartbeat before the pair is treated as disconnected (C8). */
export const HEARTBEAT_MAX_GAP_MS = 15_000;

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
  /** Active (last-focused / last-pushed) tab for tool reads. */
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
  /** Store a content-owned verification result (C6). */
  setVerificationResult(result: ProjectedVerificationResult): void;
  getVerificationResult(tabId?: string): ProjectedVerificationResult | undefined;
  /** Remove a tab's projection (tab closed). */
  clearTab(tabId: string): void;
  /** Clear all projections (disconnect / unpair). */
  clearAll(): void;
  markPaired(now: number): void;
  markUnpaired(): void;
  noteHeartbeat(now: number): void;
  setActiveTab(tabId: string): void;
  getActive(): ProjectionEntry | undefined;
  getByTab(tabId: string): ProjectionEntry | undefined;
  /**
   * True when paired and heartbeat is fresh (or just paired with no gap yet).
   * When false, tools must return not_paired / empty — never stale success.
   */
  isLive(now: number): boolean;
  snapshot(): ProjectionCacheState;
}

export function createProjectionCache(options?: {
  readonly heartbeatMaxGapMs?: number;
}): ProjectionCache {
  const heartbeatMaxGapMs = options?.heartbeatMaxGapMs ?? HEARTBEAT_MAX_GAP_MS;
  const byTab = new Map<string, ProjectionEntry>();
  const verificationByTab = new Map<string, ProjectedVerificationResult>();
  let activeTabId: string | undefined;
  let paired = false;
  let lastHeartbeatAt: number | undefined;

  return {
    ingest(entry: ProjectionEntry): boolean {
      const existing = byTab.get(entry.tabId);
      if (existing !== undefined && entry.snapshotRev < existing.snapshotRev) {
        return false;
      }
      byTab.set(entry.tabId, entry);
      activeTabId = entry.tabId;
      return true;
    },

    setVerificationResult(result: ProjectedVerificationResult): void {
      verificationByTab.set(result.tabId, result);
      activeTabId = result.tabId;
    },

    getVerificationResult(tabId?: string): ProjectedVerificationResult | undefined {
      const key = tabId ?? activeTabId;
      if (key === undefined) return undefined;
      return verificationByTab.get(key);
    },

    clearTab(tabId: string): void {
      byTab.delete(tabId);
      verificationByTab.delete(tabId);
      if (activeTabId === tabId) {
        activeTabId = byTab.keys().next().value;
      }
    },

    clearAll(): void {
      byTab.clear();
      verificationByTab.clear();
      activeTabId = undefined;
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
      activeTabId = undefined;
    },

    noteHeartbeat(now: number): void {
      lastHeartbeatAt = now;
    },

    setActiveTab(tabId: string): void {
      if (byTab.has(tabId) || verificationByTab.has(tabId)) {
        activeTabId = tabId;
      }
    },

    getActive(): ProjectionEntry | undefined {
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
