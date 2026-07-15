/**
 * @mcp-context-query — plan task 18 / ADR-020 MCP bridge e2e without daemon.
 *
 * Product path: single MCP process (stdio + discover:4322 + WS /bridge).
 * Extension pairs with the stderr pair token, pushes snapshot selection, and
 * C5 tools read the projection. No apps/daemon process is started.
 *
 * Agent-executable vitest twin (preferred CI surface):
 *   packages/mcp-server/src/mcp-bridge-e2e.test.ts
 * Sibling offline edit independence (no MCP required):
 *   apps/extension/src/journal/offline-sot-edit-loop.test.ts
 *
 * Browser binary: not required. Runs under the extension Playwright suite as a
 * Node-side bridge proof alongside browser specs.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "@playwright/test";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { WebSocket } from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const MCP_INDEX = resolve(REPO_ROOT, "packages", "mcp-server", "dist", "index.js");

/** Product-locked bridge port (ADR-020 C2). Tests bind port 0; constant is 4322. */
const PRODUCT_BRIDGE_PORT = 4322;

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

const FIXTURE_TAB = "tab-pw-e2e";
const FIXTURE_SESSION = "sess-pw-e2e";
const FIXTURE_TAG = "article";
const FIXTURE_REV = 3;

interface McpModule {
  readonly startMcpProcess: (options: {
    readonly port?: number;
    readonly skipStdio?: boolean;
    readonly writeStderr?: (line: string) => void;
  }) => Promise<{
    readonly host: string;
    readonly port: number;
    readonly pairToken: string;
    readonly server: {
      connect: (transport: unknown) => Promise<void>;
      close: () => Promise<void>;
    };
    readonly stop: () => Promise<void>;
  }>;
  readonly DEFAULT_BRIDGE_PORT: number;
  readonly DISCOVER_PATH: string;
  readonly BRIDGE_WS_PATH: string;
  readonly FORBIDDEN_DISCOVER_KEYS: readonly string[];
  readonly TOOL_NAMES: readonly string[];
  readonly minimalSnapshot: (input: {
    readonly tabId: string;
    readonly snapshotRev: number;
    readonly sessionId?: string;
    readonly selectionTag?: string;
  }) => unknown;
}

async function loadMcpModule(): Promise<McpModule> {
  const mod = (await import(pathToFileURL(MCP_INDEX).href)) as McpModule;
  return mod;
}

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

async function connectClient(server: {
  connect: (transport: unknown) => Promise<void>;
}): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "extension-e2e-mcp", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

function listDaemonArgs(): Promise<readonly string[]> {
  return new Promise((resolvePs) => {
    const child = spawn("ps", ["-eo", "args="], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("close", () => {
      resolvePs(
        out
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.includes("apps/daemon") || /daemon\/dist\/index\.js/.test(line)),
      );
    });
    child.on("error", () => resolvePs([]));
  });
}

test.describe("@mcp-context-query — MCP bridge e2e without daemon", () => {
  test("product port is 4322 and C5 tool list is slim", async () => {
    const mcp = await loadMcpModule();
    expect(mcp.DEFAULT_BRIDGE_PORT).toBe(PRODUCT_BRIDGE_PORT);
    expect(PRODUCT_BRIDGE_PORT).toBe(4322);
    expect(mcp.DISCOVER_PATH).toBe("/discover");
    expect(mcp.BRIDGE_WS_PATH).toBe("/bridge");
    expect([...mcp.TOOL_NAMES]).toEqual([...C5_TOOL_NAMES]);
    expect(mcp.TOOL_NAMES).toHaveLength(9);
    expect(mcp.TOOL_NAMES).not.toContain("vision_capture_element");
    expect(mcp.TOOL_NAMES).not.toContain("vision_get_diagnostics");
  });

  test("start MCP → discover → pair → push selection → tool read matches", async () => {
    const daemonBefore = await listDaemonArgs();
    const mcp = await loadMcpModule();
    const stderr: string[] = [];
    const processHandle = await mcp.startMcpProcess({
      port: 0,
      skipStdio: true,
      writeStderr: (line) => stderr.push(line),
    });
    let client: Client | undefined;
    let ws: WebSocket | undefined;

    try {
      expect(stderr.join("\n")).toContain(processHandle.pairToken);

      const discoverResponse = await fetch(
        `http://${processHandle.host}:${processHandle.port}${mcp.DISCOVER_PATH}`,
      );
      expect(discoverResponse.status).toBe(200);
      const discoverBody = (await discoverResponse.json()) as Record<string, unknown>;
      expect(discoverBody.port).toBe(processHandle.port);
      expect(discoverBody.wsPath).toBe("/bridge");
      expect(discoverBody.pairTokenRequired).toBe(true);
      for (const key of mcp.FORBIDDEN_DISCOVER_KEYS) {
        expect(discoverBody).not.toHaveProperty(key);
      }
      expect(JSON.stringify(discoverBody)).not.toContain(processHandle.pairToken);

      client = await connectClient(processHandle.server);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([...C5_TOOL_NAMES].sort());

      ws = await new Promise<WebSocket>((resolveWs, reject) => {
        const socket = new WebSocket(
          `ws://${processHandle.host}:${processHandle.port}${mcp.BRIDGE_WS_PATH}?token=${encodeURIComponent(processHandle.pairToken)}`,
        );
        const timer = setTimeout(() => reject(new Error("WS pair timed out")), 5_000);
        socket.once("open", () => {
          clearTimeout(timer);
          resolveWs(socket);
        });
        socket.once("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const snap = mcp.minimalSnapshot({
        tabId: FIXTURE_TAB,
        snapshotRev: FIXTURE_REV,
        sessionId: FIXTURE_SESSION,
        selectionTag: FIXTURE_TAG,
      });
      ws.send(
        JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          messageId: "pw-e2e-push",
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

      await expect
        .poll(
          async () => {
            const raw = await client?.callTool({
              name: "vision_get_selection",
              arguments: {},
            });
            const data = JSON.parse(extractText(raw)) as { elementTag?: string };
            return data.elementTag;
          },
          { timeout: 5_000, message: "pushed selection must appear on vision_get_selection" },
        )
        .toBe(FIXTURE_TAG);

      const session = JSON.parse(
        extractText(await client.callTool({ name: "vision_get_active_session", arguments: {} })),
      ) as { connected: boolean; sessionId: string };
      expect(session.connected).toBe(true);
      expect(session.sessionId).toBe(FIXTURE_SESSION);

      const selection = JSON.parse(
        extractText(await client.callTool({ name: "vision_get_selection", arguments: {} })),
      ) as { elementTag: string; sourceId?: string };
      expect(selection.elementTag).toBe(FIXTURE_TAG);
      expect(selection.sourceId).toBe(`src-${FIXTURE_TAB}`);

      const context = JSON.parse(
        extractText(await client.callTool({ name: "vision_get_source_context", arguments: {} })),
      ) as { tabId?: string; snapshotRev?: number };
      expect(context.tabId).toBe(FIXTURE_TAB);
      expect(context.snapshotRev).toBe(FIXTURE_REV);

      const daemonAfter = await listDaemonArgs();
      const spawned = daemonAfter.filter((line) => !daemonBefore.includes(line));
      expect(spawned, "must not spawn apps/daemon").toEqual([]);
    } finally {
      if (ws !== undefined) {
        await new Promise<void>((done) => {
          const t = setTimeout(done, 500);
          ws?.once("close", () => {
            clearTimeout(t);
            done();
          });
          try {
            ws?.close();
          } catch {
            done();
          }
        });
      }
      if (client !== undefined) {
        await client.close();
      }
      await processHandle.stop();
    }
  });

  test("sibling offline edit proof remains independent of MCP", async () => {
    // Offline SoT (task 4) is the automated proof that select/preview/undo work
    // with zero MCP/daemon. This assertion keeps the contract visible next to
    // the bridge e2e so the suite cannot silently re-couple offline editing.
    const offlineProof = resolve(
      REPO_ROOT,
      "apps",
      "extension",
      "src",
      "journal",
      "offline-sot-edit-loop.test.ts",
    );
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(offlineProof, "utf8");
    expect(source).toContain("@offline-sot");
    expect(source).toMatch(/must not spawn daemon/i);
    expect(source).not.toMatch(/apps\/daemon\/dist/);
  });
});
