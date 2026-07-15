/**
 * @mcp-bridge-e2e — plan task 18: MCP pair e2e without daemon (ADR-020).
 *
 * Single process: discover (product port 4322) → pair with stderr token →
 * snapshot.push → C5 tool reads match. Never spawns apps/daemon.
 */

import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import {
  BRIDGE_WS_PATH,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DISCOVER_PATH,
  FORBIDDEN_DISCOVER_KEYS,
  minimalSnapshot,
  type StartedMcpProcess,
  startMcpProcess,
  TOOL_NAMES,
} from "./index.js";

const C5_TOOL_NAMES = [
  "vision_get_active_session",
  "vision_get_selection",
  "vision_get_changeset",
  "vision_get_source_context",
  "vision_get_verification_plan",
  "vision_clear_preview",
  "vision_request_verification",
  "vision_mark_patch_started",
  "vision_mark_patch_completed",
] as const;

const FIXTURE_TAB = "tab-e2e-18";
const FIXTURE_SESSION = "sess-e2e-18";
const FIXTURE_TAG = "section";
const FIXTURE_REV = 7;

function extractText(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const content = (result as { content?: unknown[] }).content;
  const first = content?.[0];
  if (first !== undefined && typeof first === "object" && first !== null && "text" in first) {
    const text = (first as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "mcp-bridge-e2e", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

async function openPairedSocket(port: number, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://${DEFAULT_BRIDGE_HOST}:${port}${BRIDGE_WS_PATH}?token=${encodeURIComponent(token)}`,
    );
    const timer = setTimeout(() => reject(new Error("WS pair timed out")), 5_000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function closeSocket(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 500);
    ws.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.close();
  });
}

function listDaemonSpawnCandidates(): Promise<readonly string[]> {
  return new Promise((resolve) => {
    const child = spawn("ps", ["-eo", "args="], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("close", () => {
      const lines = out
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes("apps/daemon") || /daemon\/dist\/index\.js/.test(line));
      resolve(lines);
    });
    child.on("error", () => resolve([]));
  });
}

describe("@mcp-bridge-e2e — MCP pair without daemon (task 18)", () => {
  let processHandle: StartedMcpProcess | undefined;
  let client: Client | undefined;
  let socket: WebSocket | undefined;

  afterEach(async () => {
    if (socket !== undefined) {
      await closeSocket(socket);
      socket = undefined;
    }
    if (client !== undefined) {
      await client.close();
      client = undefined;
    }
    if (processHandle !== undefined) {
      await processHandle.stop();
      processHandle = undefined;
    }
  });

  it("documents product port 4322 and slim C5 tool list", () => {
    expect(DEFAULT_BRIDGE_PORT).toBe(4322);
    expect(DISCOVER_PATH).toBe("/discover");
    expect(BRIDGE_WS_PATH).toBe("/bridge");
    expect([...TOOL_NAMES]).toEqual([...C5_TOOL_NAMES]);
    expect(TOOL_NAMES).toHaveLength(9);
    expect(TOOL_NAMES).not.toContain("vision_capture_element");
    expect(TOOL_NAMES).not.toContain("vision_get_diagnostics");
  });

  it("starts single MCP process, discovers, pairs, pushes selection, tool read matches", async () => {
    const daemonBefore = await listDaemonSpawnCandidates();
    const stderr: string[] = [];
    processHandle = await startMcpProcess({
      port: 0,
      skipStdio: true,
      writeStderr: (line) => stderr.push(line),
    });

    expect(processHandle.host).toBe(DEFAULT_BRIDGE_HOST);
    expect(processHandle.port).toBeGreaterThan(0);
    expect(processHandle.pairToken.length).toBeGreaterThan(20);
    expect(stderr.join("\n")).toContain(processHandle.pairToken);

    const discoverUrl = `http://${processHandle.host}:${processHandle.port}${DISCOVER_PATH}`;
    const discoverResponse = await fetch(discoverUrl);
    expect(discoverResponse.status).toBe(200);
    const discoverBody = (await discoverResponse.json()) as Record<string, unknown>;
    expect(discoverBody).toMatchObject({
      host: DEFAULT_BRIDGE_HOST,
      port: processHandle.port,
      wsPath: BRIDGE_WS_PATH,
      pairTokenRequired: true,
      protocolVersion: "2.0.0",
    });
    for (const key of FORBIDDEN_DISCOVER_KEYS) {
      expect(discoverBody).not.toHaveProperty(key);
    }
    expect(JSON.stringify(discoverBody)).not.toContain(processHandle.pairToken);

    client = await connectClient(processHandle.server);
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([...C5_TOOL_NAMES].sort());
    expect(tools).toHaveLength(9);

    socket = await openPairedSocket(processHandle.port, processHandle.pairToken);
    const snap = minimalSnapshot({
      tabId: FIXTURE_TAB,
      snapshotRev: FIXTURE_REV,
      sessionId: FIXTURE_SESSION,
      selectionTag: FIXTURE_TAG,
    });
    socket.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "e2e-18-push",
        messageType: "snapshot.push",
        tabId: FIXTURE_TAB,
        timestamp: Date.now(),
        payload: {
          type: "snapshot.push",
          tabId: FIXTURE_TAB,
          snapshotRev: FIXTURE_REV,
          sessionId: FIXTURE_SESSION,
          snapshot: snap,
        },
      }),
    );

    await vi.waitFor(async () => {
      const selectionRaw = await client?.callTool({
        name: "vision_get_selection",
        arguments: {},
      });
      const selection = JSON.parse(extractText(selectionRaw)) as {
        elementTag?: string;
        sessionId?: string;
      };
      expect(selection.elementTag).toBe(FIXTURE_TAG);
    });

    const session = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_active_session", arguments: {} })),
    ) as { connected: boolean; sessionId: string; note?: string };
    expect(session.connected).toBe(true);
    expect(session.sessionId).toBe(FIXTURE_SESSION);
    expect(session.note).toBeUndefined();

    const selection = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_selection", arguments: {} })),
    ) as { elementTag: string; sessionId: string; sourceId?: string; selector?: string };
    expect(selection.elementTag).toBe(FIXTURE_TAG);
    expect(selection.sessionId).toBe(FIXTURE_SESSION);
    expect(selection.sourceId).toBe(`src-${FIXTURE_TAB}`);
    expect(selection.selector).toBe(`${FIXTURE_TAG.toLowerCase()}.primary`);

    const context = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_source_context", arguments: {} })),
    ) as { tabId?: string; snapshotRev?: number; sessionId?: string };
    expect(context.tabId).toBe(FIXTURE_TAB);
    expect(context.snapshotRev).toBe(FIXTURE_REV);
    expect(context.sessionId).toBe(FIXTURE_SESSION);

    const plan = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_verification_plan", arguments: {} })),
    ) as { passed?: boolean; assertions: unknown[] };
    expect(plan.passed).not.toBe(true);
    expect(Array.isArray(plan.assertions)).toBe(true);

    const daemonAfter = await listDaemonSpawnCandidates();
    const spawned = daemonAfter.filter((line) => !daemonBefore.includes(line));
    expect(spawned, "must not spawn apps/daemon").toEqual([]);
  });

  it("keeps offline independence: unpaired tools never invent selection", async () => {
    processHandle = await startMcpProcess({
      port: 0,
      skipStdio: true,
      writeStderr: () => {},
    });
    client = await connectClient(processHandle.server);

    const session = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_active_session", arguments: {} })),
    ) as { connected: boolean; note?: string };
    expect(session.connected).toBe(false);
    expect(session.note).toBe("not_paired");

    const selection = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_selection", arguments: {} })),
    ) as { elementTag: string; sessionId: string };
    expect(selection.elementTag).toBe("unknown");
    expect(selection.sessionId).toBe("none");

    const plan = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_verification_plan", arguments: {} })),
    ) as { notes: string; passed?: boolean };
    expect(plan.notes).toBe("not_paired");
    expect(plan.passed).not.toBe(true);
  });
});
