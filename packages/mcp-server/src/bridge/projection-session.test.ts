import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import {
  type BridgeServerHandle,
  createBridgeSession,
  createCommandQueue,
  createProjectionCache,
  minimalSnapshot,
  mintPairToken,
  startBridgeServer,
} from "./index.js";

type SnapshotInput = {
  readonly tabId: string;
  readonly sessionId: string;
  readonly snapshotRev: number;
};

function snapshotEnvelope(input: SnapshotInput): string {
  return JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    messageId: `${input.sessionId}-snapshot-${input.snapshotRev}`,
    messageType: "snapshot.push",
    tabId: input.tabId,
    timestamp: 1_000,
    payload: {
      type: "snapshot.push",
      ...input,
      snapshot: minimalSnapshot({ ...input, selectionTag: "article" }),
    },
  });
}

describe("bridge projection session generations", () => {
  let handle: BridgeServerHandle | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.close();
    await handle?.stop();
    client = undefined;
    handle = undefined;
  });

  it("Given a live same-tab old session at rev 9, when a new session pushes rev 1, then the new generation replaces old projection and verification", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    const session = createBridgeSession({ cache, commands, now: () => 1_000 });
    const pairToken = mintPairToken({ now: () => 0 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => session.attach(socket),
    });
    client = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      socket.once("open", () => resolve(socket));
      socket.once("error", reject);
    });
    client.send(snapshotEnvelope({ tabId: "tab-live", sessionId: "session-old", snapshotRev: 9 }));
    await vi.waitFor(() => expect(cache.getActive()?.snapshotRev).toBe(9));
    cache.setVerificationResult({
      tabId: "tab-live",
      sessionId: "session-old",
      ts: 1_001,
      passed: true,
      details: { assertions: [{ name: "old-pass" }] },
      commandId: "old-command",
    });
    expect(cache.getVerificationResult("tab-live")?.passed).toBe(true);

    client.send(snapshotEnvelope({ tabId: "tab-live", sessionId: "session-new", snapshotRev: 1 }));

    await vi.waitFor(() => {
      expect(cache.getActive()).toMatchObject({ sessionId: "session-new", snapshotRev: 1 });
    });
    expect(cache.getVerificationResult("tab-live")).toBeUndefined();
  });

  it("Given a current tab session, when lower current-session revisions and foreign verification arrive, then neither replaces compatible state", () => {
    const cache = createProjectionCache();
    const current = minimalSnapshot({ tabId: "tab-live", sessionId: "current", snapshotRev: 3 });
    expect(
      cache.ingest({
        tabId: "tab-live",
        sessionId: "current",
        snapshotRev: 3,
        snapshot: current,
        ingestedAt: 1_000,
      }),
    ).toBe(true);

    expect(
      cache.ingest({
        tabId: "tab-live",
        sessionId: "current",
        snapshotRev: 2,
        snapshot: minimalSnapshot({
          tabId: "tab-live",
          sessionId: "current",
          snapshotRev: 2,
        }),
        ingestedAt: 1_001,
      }),
    ).toBe(false);
    expect(
      cache.setVerificationResult({
        tabId: "tab-live",
        sessionId: "foreign",
        ts: 1_002,
        passed: true,
        details: { assertions: [{ name: "foreign-pass" }] },
        commandId: "foreign-command",
      }),
    ).toBe(false);
    expect(cache.getByTab("tab-live")?.snapshotRev).toBe(3);
    expect(cache.getVerificationResult("tab-live")).toBeUndefined();
  });

  it("Given a retired tab session, when its delayed snapshot and verification arrive, then the current generation remains authoritative", () => {
    const cache = createProjectionCache();
    const entry = (sessionId: string, snapshotRev: number) => ({
      tabId: "tab-live",
      sessionId,
      snapshotRev,
      snapshot: minimalSnapshot({ tabId: "tab-live", sessionId, snapshotRev }),
      ingestedAt: snapshotRev,
    });
    expect(cache.ingest(entry("session-old", 9))).toBe(true);
    expect(cache.ingest(entry("session-new", 1))).toBe(true);

    expect(cache.ingest(entry("session-old", 10))).toBe(false);
    expect(
      cache.setVerificationResult({
        tabId: "tab-live",
        sessionId: "session-old",
        ts: 10,
        passed: true,
        details: { assertions: [{ name: "retired-pass" }] },
        commandId: "retired-command",
      }),
    ).toBe(false);
    expect(cache.getByTab("tab-live")).toMatchObject({
      sessionId: "session-new",
      snapshotRev: 1,
    });
    expect(cache.getVerificationResult("tab-live")).toBeUndefined();
  });

  it("Given a current session result, when an older result and an unidentified result arrive, then neither can overwrite or create verification", () => {
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
        ts: 20,
        passed: false,
        details: { assertions: [{ name: "current-failure" }] },
        commandId: "current-command",
      }),
    ).toBe(true);

    expect(
      cache.setVerificationResult({
        tabId: "tab-live",
        sessionId: "session-current",
        ts: 10,
        passed: true,
        details: { assertions: [{ name: "stale-pass" }] },
        commandId: "stale-command",
      }),
    ).toBe(false);
    expect(cache.getVerificationResult("tab-live")?.passed).toBe(false);
    expect(
      cache.setVerificationResult({
        tabId: "tab-live",
        sessionId: "session-current",
        ts: 20,
        passed: true,
        details: { assertions: [{ name: "equal-time-pass" }] },
        commandId: "equal-time-command",
      }),
    ).toBe(false);
    expect(cache.getVerificationResult("tab-live")?.passed).toBe(false);

    const unidentified = createProjectionCache();
    unidentified.ingest({
      tabId: "tab-live",
      sessionId: undefined,
      snapshotRev: 1,
      snapshot: minimalSnapshot({ tabId: "tab-live", snapshotRev: 1 }),
      ingestedAt: 1,
    });
    expect(
      unidentified.setVerificationResult({
        tabId: "tab-live",
        sessionId: undefined,
        ts: 1,
        passed: true,
        details: { assertions: [{ name: "unidentified-pass" }] },
        commandId: "unidentified-command",
      }),
    ).toBe(false);
  });

  it("Given conflicting envelope and snapshot sessions, when the projection is ingested, then incompatible identity is rejected", () => {
    const cache = createProjectionCache();

    expect(
      cache.ingest({
        tabId: "tab-live",
        sessionId: "session-envelope",
        snapshotRev: 1,
        snapshot: minimalSnapshot({
          tabId: "tab-live",
          sessionId: "session-snapshot",
          snapshotRev: 1,
        }),
        ingestedAt: 1,
      }),
    ).toBe(false);
    expect(cache.getByTab("tab-live")).toBeUndefined();
  });
});
