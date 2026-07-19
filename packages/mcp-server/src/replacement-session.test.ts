import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import {
  GetVerificationPlanOutputSchema,
  minimalSnapshot,
  type StartedMcpProcess,
  startMcpProcess,
} from "./index.js";

type ProjectionInput = {
  readonly tabId: string;
  readonly sessionId: string;
  readonly snapshotRev: number;
  readonly passed: boolean;
};

const OLD_PROJECTION = {
  tabId: "tab-old",
  sessionId: "session-old",
  snapshotRev: 1,
  passed: true,
} as const;

const FRESH_PROJECTION = {
  tabId: "tab-fresh",
  sessionId: "session-fresh",
  snapshotRev: 1,
  passed: true,
} as const;

function extractText(result: unknown): string {
  if (typeof result !== "object" || result === null || !("content" in result)) return "";
  const content = result.content;
  if (!Array.isArray(content)) return "";
  const first = content[0];
  if (typeof first !== "object" || first === null || !("text" in first)) return "";
  return typeof first.text === "string" ? first.text : "";
}

async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "replacement-session", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

async function openPairedSocket(processHandle: StartedMcpProcess): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${processHandle.port}/bridge?token=${encodeURIComponent(processHandle.pairToken)}`,
    );
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 500);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.close();
  });
}

function pushProjection(socket: WebSocket, input: ProjectionInput): void {
  const snapshot = minimalSnapshot({
    tabId: input.tabId,
    snapshotRev: input.snapshotRev,
    sessionId: input.sessionId,
    selectionTag: "main",
  });
  socket.send(
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      messageId: `${input.sessionId}-snapshot`,
      messageType: "snapshot.push",
      tabId: input.tabId,
      timestamp: 1_000,
      payload: {
        type: "snapshot.push",
        tabId: input.tabId,
        snapshotRev: input.snapshotRev,
        sessionId: input.sessionId,
        snapshot,
      },
    }),
  );
  socket.send(
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      messageId: `${input.sessionId}-verification`,
      messageType: "verification.result",
      tabId: input.tabId,
      timestamp: 1_001,
      payload: {
        type: "verification.result",
        tabId: input.tabId,
        sessionId: input.sessionId,
        ts: 1_001,
        passed: input.passed,
        details: { assertions: [{ name: `${input.sessionId}-assertion` }] },
        commandId: `${input.sessionId}-command`,
      },
    }),
  );
}

async function readVerificationPlan(client: Client) {
  const result = await client.callTool({
    name: "vision_get_verification_plan",
    arguments: {},
  });
  return GetVerificationPlanOutputSchema.parse(JSON.parse(extractText(result)));
}

describe("replacement bridge session projection freshness", () => {
  let processHandle: StartedMcpProcess | undefined;
  let client: Client | undefined;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    await Promise.all(sockets.splice(0).map((socket) => closeSocket(socket)));
    await client?.close();
    client = undefined;
    await processHandle?.stop();
    processHandle = undefined;
  });

  async function seedOldPassingProjection(): Promise<{
    readonly processHandle: StartedMcpProcess;
    readonly client: Client;
  }> {
    const started = await startMcpProcess({
      port: 0,
      skipStdio: true,
      writeStderr: () => {},
    });
    const connected = await connectClient(started.server);
    processHandle = started;
    client = connected;
    const oldSocket = await openPairedSocket(started);
    sockets.push(oldSocket);
    pushProjection(oldSocket, OLD_PROJECTION);
    await vi.waitFor(async () => {
      expect((await readVerificationPlan(connected)).sessionId).toBe(OLD_PROJECTION.sessionId);
    });
    return { processHandle: started, client: connected };
  }

  it("Given an old passing projection, when a replacement socket attaches, then the verification tool exposes no old success or identity", async () => {
    const harness = await seedOldPassingProjection();

    const replacement = await openPairedSocket(harness.processHandle);
    sockets.push(replacement);
    const plan = await readVerificationPlan(harness.client);

    expect(plan.passed).not.toBe(true);
    expect(plan.sessionId).not.toBe(OLD_PROJECTION.sessionId);
    expect(plan.tabId).not.toBe(OLD_PROJECTION.tabId);
    expect(plan.assertions).toEqual([]);
  });

  it("Given a replacement with no readable projection, when it pushes current state, then the verification tool exposes only the fresh session", async () => {
    const harness = await seedOldPassingProjection();
    const replacement = await openPairedSocket(harness.processHandle);
    sockets.push(replacement);
    await vi.waitFor(async () => {
      expect((await readVerificationPlan(harness.client)).passed).not.toBe(true);
    });

    pushProjection(replacement, FRESH_PROJECTION);

    await vi.waitFor(async () => {
      const plan = await readVerificationPlan(harness.client);
      expect(plan.passed).toBe(true);
      expect(plan.sessionId).toBe(FRESH_PROJECTION.sessionId);
      expect(plan.tabId).toBe(FRESH_PROJECTION.tabId);
    });
  });
});
