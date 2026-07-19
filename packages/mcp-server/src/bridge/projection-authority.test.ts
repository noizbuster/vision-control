import { describe, expect, it } from "vitest";

import {
  createProjectionCache,
  minimalSnapshot,
  type ProjectionCache,
  type ProjectionEntry,
} from "./index.js";

function projectionEntry(tabId: string, sessionId: string, snapshotRev: number): ProjectionEntry {
  return {
    tabId,
    sessionId,
    snapshotRev,
    snapshot: minimalSnapshot({ tabId, sessionId, snapshotRev, selectionTag: tabId }),
    ingestedAt: snapshotRev,
  };
}

function focusedCache(): ProjectionCache {
  const cache = createProjectionCache();
  cache.ingest(projectionEntry("tab-a", "session-a", 1));
  cache.ingest(projectionEntry("tab-b", "session-b", 1));
  cache.setActiveTab("tab-a", "session-a");
  return cache;
}

describe("projection cache last-focused authority (ADR-019 C6)", () => {
  it("makes a matching first snapshot active when its focus fact arrived first", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");

    // When
    const focusAccepted = cache.setActiveTab("tab-b", "session-b");
    const snapshotAccepted = cache.ingest(projectionEntry("tab-b", "session-b", 1));

    // Then
    expect(focusAccepted).toBe(true);
    expect(snapshotAccepted).toBe(true);
    expect(cache.getActive()).toMatchObject({ tabId: "tab-b", sessionId: "session-b" });
  });

  it("keeps early focus unresolved through a wrong-session snapshot", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(true);

    // When
    const wrongSessionAccepted = cache.ingest(projectionEntry("tab-b", "session-wrong", 1));

    // Then
    expect(wrongSessionAccepted).toBe(true);
    expect(cache.getActive()).toBeUndefined();
    expect(
      cache.setVerificationResult({
        tabId: "tab-b",
        sessionId: "session-wrong",
        ts: 1,
        passed: true,
        details: { assertions: [] },
        commandId: "wrong-session-command",
      }),
    ).toBe(true);
    expect(cache.getVerificationResult()).toBeUndefined();
    expect(cache.ingest(projectionEntry("tab-b", "session-b", 1))).toBe(true);
    expect(cache.getActive()).toMatchObject({ tabId: "tab-b", sessionId: "session-b" });
  });

  it("keeps exact early focus through a wrong cached-session close", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");
    cache.setVerificationResult({
      tabId: "tab-a",
      sessionId: "session-a",
      ts: 1,
      passed: true,
      details: { assertions: [] },
      commandId: "command-a",
    });
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(true);

    // When
    const wrongSnapshotAccepted = cache.ingest(projectionEntry("tab-b", "session-wrong", 1));
    const wrongCloseAccepted = cache.clearTab("tab-b", "session-wrong");
    const activeAfterWrongClose = cache.getActive();
    const verificationAfterWrongClose = cache.getVerificationResult();
    const matchingSnapshotAccepted = cache.ingest(projectionEntry("tab-b", "session-b", 1));

    // Then
    expect(wrongSnapshotAccepted).toBe(true);
    expect(wrongCloseAccepted).toBe(true);
    expect(cache.getByTab("tab-b")).toMatchObject({ sessionId: "session-b" });
    expect(activeAfterWrongClose).toBeUndefined();
    expect(verificationAfterWrongClose).toBeUndefined();
    expect(matchingSnapshotAccepted).toBe(true);
    expect(cache.getActive()).toMatchObject({ tabId: "tab-b", sessionId: "session-b" });
  });

  it("does not promote a wrong cached session when the matching early focus closes", () => {
    // Given
    const cache = createProjectionCache();
    expect(cache.setActiveTab("tab-b", "session-current")).toBe(true);
    expect(cache.ingest(projectionEntry("tab-b", "session-stale", 1))).toBe(true);

    // When
    const closeAccepted = cache.clearTab("tab-b", "session-current");

    // Then
    expect(closeAccepted).toBe(true);
    expect(cache.getByTab("tab-b")).toBeUndefined();
    expect(cache.getActive()).toBeUndefined();
    expect(cache.setActiveTab("tab-b", "session-stale")).toBe(false);
  });

  it("keeps exact early focus through a sessionless cached close", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(true);

    // When
    const sessionlessSnapshotAccepted = cache.ingest({
      tabId: "tab-b",
      sessionId: undefined,
      snapshotRev: 1,
      snapshot: minimalSnapshot({ tabId: "tab-b", snapshotRev: 1 }),
      ingestedAt: 1,
    });
    const sessionlessCloseAccepted = cache.clearTab("tab-b", undefined);
    const activeAfterSessionlessClose = cache.getActive();
    const matchingSnapshotAccepted = cache.ingest(projectionEntry("tab-b", "session-b", 1));

    // Then
    expect(sessionlessSnapshotAccepted).toBe(true);
    expect(sessionlessCloseAccepted).toBe(true);
    expect(activeAfterSessionlessClose).toBeUndefined();
    expect(matchingSnapshotAccepted).toBe(true);
    expect(cache.getActive()).toMatchObject({ tabId: "tab-b", sessionId: "session-b" });
  });

  it("accepts a first-time sessionless snapshot before any identified generation", () => {
    // Given
    const cache = createProjectionCache();
    const snapshot = minimalSnapshot({ tabId: "tab-sessionless", snapshotRev: 1 });

    // When
    const accepted = cache.ingest({
      tabId: "tab-sessionless",
      sessionId: undefined,
      snapshotRev: 1,
      snapshot,
      ingestedAt: 1,
    });

    // Then
    expect(accepted).toBe(true);
    expect(cache.getActive()).toMatchObject({ tabId: "tab-sessionless", sessionId: undefined });
  });

  it("rejects a sessionless snapshot after an identified generation closes", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-closed", "session-closed", 1));
    cache.setActiveTab("tab-closed", "session-closed");
    cache.clearTab("tab-closed", "session-closed");

    // When
    const accepted = cache.ingest({
      tabId: "tab-closed",
      sessionId: undefined,
      snapshotRev: 2,
      snapshot: minimalSnapshot({ tabId: "tab-closed", snapshotRev: 2 }),
      ingestedAt: 2,
    });

    // Then
    expect(accepted).toBe(false);
    expect(cache.getByTab("tab-closed")).toBeUndefined();
  });

  it("rejects sessionless early focus without changing established authority", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");

    // When
    const accepted = cache.setActiveTab("tab-b", undefined);

    // Then
    expect(accepted).toBe(false);
    expect(cache.ingest(projectionEntry("tab-b", "session-b", 1))).toBe(true);
    expect(cache.getActive()?.tabId).toBe("tab-a");
  });

  it("rejects focus for the wrong session of a cached tab", () => {
    // Given
    const cache = focusedCache();

    // When
    const accepted = cache.setActiveTab("tab-b", "session-wrong");

    // Then
    expect(accepted).toBe(false);
    expect(cache.getActive()?.tabId).toBe("tab-a");
  });

  it("rejects focus from a retired session generation", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-b", "session-retired", 9));
    cache.ingest(projectionEntry("tab-b", "session-current", 1));
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");

    // When
    const accepted = cache.setActiveTab("tab-b", "session-retired");

    // Then
    expect(accepted).toBe(false);
    expect(cache.getActive()?.tabId).toBe("tab-a");
  });

  it("invalidates matching early focus when the tab closes before its snapshot", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(true);

    // When
    const cleared = cache.clearTab("tab-b", "session-b");

    // Then
    expect(cleared).toBe(true);
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(false);
    expect(cache.ingest(projectionEntry("tab-b", "session-b", 1))).toBe(false);
    expect(cache.getActive()?.tabId).toBe("tab-a");
  });

  it("invalidates early focus across unpair and a new pair generation", () => {
    // Given
    const cache = createProjectionCache();
    cache.markPaired(1);
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(true);

    // When
    cache.markUnpaired();
    cache.markPaired(2);
    cache.ingest(projectionEntry("tab-b", "session-b", 1));
    cache.ingest(projectionEntry("tab-a", "session-a", 1));

    // Then
    expect(cache.getActive()?.tabId).toBe("tab-a");
  });

  it("rejects a stale revision after early focus resolves", () => {
    // Given
    const cache = createProjectionCache();
    cache.ingest(projectionEntry("tab-a", "session-a", 1));
    cache.setActiveTab("tab-a", "session-a");
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(true);
    cache.ingest(projectionEntry("tab-b", "session-b", 2));

    // When
    const staleAccepted = cache.ingest(projectionEntry("tab-b", "session-b", 1));

    // Then
    expect(staleAccepted).toBe(false);
    expect(cache.getActive()).toMatchObject({ tabId: "tab-b", snapshotRev: 2 });
  });

  it("keeps tab A active when a later snapshot refreshes non-focused tab B", () => {
    // Given
    const cache = focusedCache();

    // When
    const accepted = cache.ingest(projectionEntry("tab-b", "session-b", 2));

    // Then
    expect(accepted).toBe(true);
    expect(cache.getByTab("tab-b")?.snapshotRev).toBe(2);
    expect(cache.getActive()?.tabId).toBe("tab-a");
  });

  it("keeps an ordinary focused session authoritative through snapshot refresh", () => {
    // Given
    const cache = focusedCache();
    expect(cache.setActiveTab("tab-b", "session-b")).toBe(true);

    // When
    const accepted = cache.ingest(projectionEntry("tab-b", "session-b", 2));

    // Then
    expect(accepted).toBe(true);
    expect(cache.getActive()).toMatchObject({ tabId: "tab-b", snapshotRev: 2 });
  });

  it("keeps tab A active when a later verification result refreshes non-focused tab B", () => {
    // Given
    const cache = focusedCache();

    // When
    const accepted = cache.setVerificationResult({
      tabId: "tab-b",
      sessionId: "session-b",
      ts: 10,
      passed: true,
      details: { assertions: [] },
      commandId: "command-b",
    });

    // Then
    expect(accepted).toBe(true);
    expect(cache.getVerificationResult("tab-b")?.passed).toBe(true);
    expect(cache.getActive()?.tabId).toBe("tab-a");
  });

  it("transfers authority when non-focused tab B is explicitly focused later", () => {
    // Given
    const cache = focusedCache();

    // When
    const accepted = cache.setActiveTab("tab-b", "session-b");

    // Then
    expect(accepted).toBe(true);
    expect(cache.getActive()?.tabId).toBe("tab-b");
  });
});
