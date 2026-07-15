import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import {
  type BridgeServerHandle,
  createBridgeSession,
  createCommandQueue,
  createProjectionCache,
  createProjectionDeps,
  HEARTBEAT_MAX_GAP_MS,
  minimalSnapshot,
  mintPairToken,
  startBridgeServer,
} from "./index.js";

describe("projection cache (ADR-020)", () => {
  it("ingests snapshot.push and reads the same tab/session/rev ids", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue({ uuid: () => "cmd-fixed" });
    cache.markPaired(1_000);
    const snap = minimalSnapshot({
      tabId: "tab-A",
      snapshotRev: 4,
      sessionId: "sess-A",
      selectionTag: "button",
    });
    const accepted = cache.ingest({
      tabId: "tab-A",
      sessionId: "sess-A",
      snapshotRev: 4,
      snapshot: snap,
      ingestedAt: 1_000,
    });
    expect(accepted).toBe(true);

    const deps = createProjectionDeps({ cache, commands, now: () => 1_000 });
    const session = await deps.getActiveSession();
    expect(session.connected).toBe(true);
    expect(session.sessionId).toBe("sess-A");
    expect(session.note).toBeUndefined();

    const selection = await deps.getSelection();
    expect(selection.sessionId).toBe("sess-A");
    expect(selection.elementTag).toBe("button");
    expect(selection.sourceId).toBe("src-tab-A");
    expect(selection.selector).toBe("button.primary");

    const context = await deps.getSourceContext();
    expect(context).toMatchObject({
      tabId: "tab-A",
      snapshotRev: 4,
      sessionId: "sess-A",
    });
  });

  it("rejects stale lower snapshotRev for the same tab", () => {
    const cache = createProjectionCache();
    const snap1 = minimalSnapshot({ tabId: "t", snapshotRev: 5 });
    const snap0 = minimalSnapshot({ tabId: "t", snapshotRev: 3 });
    expect(
      cache.ingest({
        tabId: "t",
        sessionId: undefined,
        snapshotRev: 5,
        snapshot: snap1,
        ingestedAt: 1,
      }),
    ).toBe(true);
    expect(
      cache.ingest({
        tabId: "t",
        sessionId: undefined,
        snapshotRev: 3,
        snapshot: snap0,
        ingestedAt: 2,
      }),
    ).toBe(false);
    expect(cache.getActive()?.snapshotRev).toBe(5);
  });

  it("unpaired tools return explicit not_paired / empty (never invent selection)", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    const deps = createProjectionDeps({ cache, commands, now: () => 0 });

    const session = await deps.getActiveSession();
    expect(session.connected).toBe(false);
    expect(session.note).toBe("not_paired");

    const selection = await deps.getSelection();
    expect(selection.elementTag).toBe("unknown");
    expect(selection.sessionId).toBe("none");

    const plan = await deps.getVerificationPlan();
    expect(plan.notes).toBe("not_paired");
    expect(plan.assertions).toEqual([]);
    expect(plan.passed).not.toBe(true);

    const clear = await deps.clearPreview();
    expect(clear.acknowledged).toBe(false);
    expect(clear.message).toBe("not_paired");

    expect(await deps.getSourceContext()).toBeUndefined();
  });

  it("projects verification.result and never returns stale passed when unpaired (C6)", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    cache.markPaired(1_000);
    cache.setVerificationResult({
      tabId: "tab-v",
      sessionId: "sess-v",
      ts: 1_500,
      passed: true,
      details: {
        assertions: [{ name: "preview-cleared", passed: true }],
      },
      commandId: "cmd-v",
    });
    const live = createProjectionDeps({ cache, commands, now: () => 1_000 });
    const plan = await live.getVerificationPlan();
    expect(plan.passed).toBe(true);
    expect(plan.tabId).toBe("tab-v");
    expect(plan.sessionId).toBe("sess-v");
    expect(plan.ts).toBe(1_500);
    expect(plan.assertions.some((a) => a.description === "preview-cleared")).toBe(true);

    cache.markUnpaired();
    const dead = createProjectionDeps({ cache, commands, now: () => 1_000 });
    const unpaired = await dead.getVerificationPlan();
    expect(unpaired.notes).toBe("not_paired");
    expect(unpaired.passed).not.toBe(true);
    expect(unpaired.assertions).toEqual([]);
    expect(JSON.stringify(unpaired)).not.toMatch(/"passed"\s*:\s*true/);
  });

  it("closed tab is not stale — clearTab drops projection", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    cache.markPaired(100);
    cache.ingest({
      tabId: "tab-closed",
      sessionId: "s1",
      snapshotRev: 1,
      snapshot: minimalSnapshot({
        tabId: "tab-closed",
        snapshotRev: 1,
        selectionTag: "span",
      }),
      ingestedAt: 100,
    });
    cache.clearTab("tab-closed");
    const deps = createProjectionDeps({ cache, commands, now: () => 100 });
    expect(await deps.getSourceContext()).toBeUndefined();
    const selection = await deps.getSelection();
    expect(selection.elementTag).toBe("unknown");
  });

  it("heartbeat gap > 15s marks disconnected (not_paired)", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    cache.markPaired(0);
    cache.ingest({
      tabId: "tab-1",
      sessionId: "s",
      snapshotRev: 1,
      snapshot: minimalSnapshot({ tabId: "tab-1", snapshotRev: 1, selectionTag: "div" }),
      ingestedAt: 0,
    });
    expect(HEARTBEAT_MAX_GAP_MS).toBe(15_000);
    const depsLive = createProjectionDeps({ cache, commands, now: () => 10_000 });
    expect((await depsLive.getActiveSession()).connected).toBe(true);

    const depsStale = createProjectionDeps({
      cache,
      commands,
      now: () => HEARTBEAT_MAX_GAP_MS + 1,
    });
    expect((await depsStale.getActiveSession()).connected).toBe(false);
    expect((await depsStale.getActiveSession()).note).toBe("not_paired");
    expect((await depsStale.getVerificationPlan()).notes).toBe("not_paired");
  });
});

describe("command queue", () => {
  it("enqueues clear_preview and records ack", () => {
    const queue = createCommandQueue({ uuid: () => "c1" });
    const cmd = queue.enqueue({ kind: "clear_preview", tabId: "t1" }, 10);
    expect(cmd.commandId).toBe("c1");
    expect(cmd.status).toBe("pending");
    expect(queue.pending()).toHaveLength(1);
    const acked = queue.ack("c1", true);
    expect(acked?.status).toBe("acked");
    expect(queue.pending()).toHaveLength(0);
  });
});

describe("bridge session round-trip (WS)", () => {
  let handle: BridgeServerHandle | undefined;

  afterEach(async () => {
    if (handle !== undefined) {
      await handle.stop();
      handle = undefined;
    }
  });

  it("push while socket open then tool read matches before close", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue({ uuid: () => "cmd-ws-2" });
    const clock = 1_000;
    const session = createBridgeSession({
      cache,
      commands,
      now: () => clock,
      uuid: () => "envelope-id-2",
    });
    const pairToken = mintPairToken({ now: () => 0 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => {
        session.attach(socket);
      },
    });

    const snap = minimalSnapshot({
      tabId: "tab-live",
      snapshotRev: 9,
      sessionId: "sess-live",
      selectionTag: "article",
    });

    const inbound: string[] = [];
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      socket.on("message", (data) => {
        inbound.push(typeof data === "string" ? data : data.toString("utf8"));
      });
      socket.on("open", () => resolve(socket));
      socket.on("error", reject);
    });

    ws.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "push-live-01",
        messageType: "snapshot.push",
        tabId: "tab-live",
        timestamp: clock,
        payload: {
          type: "snapshot.push",
          tabId: "tab-live",
          snapshotRev: 9,
          sessionId: "sess-live",
          snapshot: snap,
        },
      }),
    );

    await vi.waitFor(() => {
      expect(cache.getActive()?.snapshotRev).toBe(9);
    });

    const deps = createProjectionDeps({
      cache,
      commands,
      now: () => clock,
      sendCommand: (p) => session.sendCommand(p),
    });
    const selection = await deps.getSelection();
    expect(selection.elementTag).toBe("article");
    expect(selection.sessionId).toBe("sess-live");
    const ctx = await deps.getSourceContext();
    expect(ctx).toMatchObject({ tabId: "tab-live", snapshotRev: 9 });

    const clear = await deps.clearPreview();
    expect(clear.acknowledged).toBe(true);
    expect(clear.message).toContain("cmd-ws-2");

    await vi.waitFor(() => {
      expect(inbound.length).toBeGreaterThanOrEqual(1);
    });
    const parsed = JSON.parse(inbound[0] ?? "{}") as {
      messageType: string;
      payload: { type: string; kind: string; commandId: string };
    };
    expect(parsed.messageType).toBe("command.enqueue");
    expect(parsed.payload.kind).toBe("clear_preview");
    expect(parsed.payload.commandId).toBe("cmd-ws-2");

    ws.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "ack-msg-01",
        messageType: "command.ack",
        timestamp: clock,
        payload: {
          type: "command.ack",
          commandId: "cmd-ws-2",
          ok: true,
          tabId: "tab-live",
        },
      }),
    );
    await vi.waitFor(() => {
      expect(commands.get("cmd-ws-2")?.status).toBe("acked");
    });

    ws.close();
  });
});
