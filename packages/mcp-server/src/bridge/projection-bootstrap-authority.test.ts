import { describe, expect, it } from "vitest";

import { createProjectionCache, minimalSnapshot, type ProjectionEntry } from "./index.js";

function projectionEntry(
  tabId: string,
  sessionId: string | undefined,
  snapshotRev: number,
): ProjectionEntry {
  return {
    tabId,
    sessionId,
    snapshotRev,
    snapshot: minimalSnapshot({
      tabId,
      snapshotRev,
      ...(sessionId === undefined ? {} : { sessionId }),
    }),
    ingestedAt: snapshotRev,
  };
}

describe("projection bootstrap authority", () => {
  it("keeps an identified replacement when its focused sessionless generation closes late", () => {
    const cache = createProjectionCache();
    expect(cache.ingest(projectionEntry("tab-live", undefined, 1))).toBe(true);
    expect(cache.getActive()).toMatchObject({ sessionId: undefined, snapshotRev: 1 });
    expect(cache.setActiveTab("tab-live", undefined)).toBe(true);
    expect(cache.ingest(projectionEntry("tab-live", "session-current", 1))).toBe(true);

    const closeAccepted = cache.clearTab("tab-live", undefined);

    expect(closeAccepted).toBe(true);
    expect(cache.getByTab("tab-live")).toMatchObject({
      sessionId: "session-current",
      snapshotRev: 1,
    });
    expect(cache.setActiveTab("tab-live", "session-current")).toBe(true);
    expect(cache.getActive()?.sessionId).toBe("session-current");
  });

  it("keeps pre-focus bootstrap authority on the last snapshot instead of a verification result", () => {
    const cache = createProjectionCache();
    expect(cache.ingest(projectionEntry("tab-a", "session-a", 1))).toBe(true);
    expect(cache.ingest(projectionEntry("tab-b", "session-b", 1))).toBe(true);
    expect(cache.getActive()?.tabId).toBe("tab-b");

    const accepted = cache.setVerificationResult({
      tabId: "tab-a",
      sessionId: "session-a",
      ts: 2,
      passed: true,
      details: { assertions: [] },
      commandId: "command-a",
    });

    expect(accepted).toBe(true);
    expect(cache.getVerificationResult("tab-a")?.passed).toBe(true);
    expect(cache.getActive()?.tabId).toBe("tab-b");
  });
});
