import { describe, expect, it } from "vitest";

import { createProjectionCache, minimalSnapshot } from "./index.js";

describe("projection cache bounded freshness", () => {
  it("Given repeated same-tab session rollover, when retirement history reaches its bound, then later generations fail closed", () => {
    const cache = createProjectionCache();
    const ingest = (sessionId: string) =>
      cache.ingest({
        tabId: "tab-live",
        sessionId,
        snapshotRev: 1,
        snapshot: minimalSnapshot({ tabId: "tab-live", sessionId, snapshotRev: 1 }),
        ingestedAt: 1,
      });
    expect(ingest("session-0")).toBe(true);
    for (let index = 1; index <= 64; index += 1) {
      expect(ingest(`session-${index}`)).toBe(true);
    }

    expect(ingest("session-overflow")).toBe(false);
    expect(cache.getByTab("tab-live")?.sessionId).toBe("session-64");
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1.5,
  ])("Given invalid verification timestamp %s, when admitted, then no result is stored", (ts) => {
    const cache = createProjectionCache();
    cache.ingest({
      tabId: "tab-live",
      sessionId: "session-current",
      snapshotRev: 1,
      snapshot: minimalSnapshot({
        tabId: "tab-live",
        sessionId: "session-current",
        snapshotRev: 1,
      }),
      ingestedAt: 1,
    });

    expect(
      cache.setVerificationResult({
        tabId: "tab-live",
        sessionId: "session-current",
        ts,
        passed: true,
        details: {},
        commandId: "invalid-time",
      }),
    ).toBe(false);
    expect(cache.getVerificationResult("tab-live")).toBeUndefined();
  });
});
