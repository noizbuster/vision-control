import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

const TEST_FILE = fileURLToPath(import.meta.url);
const DAEMON_BIN = resolve(dirname(TEST_FILE), "../dist/index.js");

interface ReadyInfo {
  readonly port: number;
  readonly host: string;
  readonly pairingUrl: string;
  readonly sessionId: string;
  readonly token: string;
  readonly mcpUrl: string;
  readonly mcpToken: string;
}

interface DaemonProc {
  readonly child: ChildProcess;
  readonly ready: ReadyInfo;
  readonly stop: () => Promise<void>;
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-mcp-"));
  writeFileSync(
    `${dir}/vision-control.config.ts`,
    "export default { workspace: { root: '/tmp/vc-mcp' }, origins: [] };\n",
  );
  return dir;
}

async function waitForOutput(
  child: ChildProcess,
  predicate: (line: string) => boolean,
  timeoutMs = 8000,
): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for daemon output"));
    }, timeoutMs);
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (predicate(line)) {
          clearTimeout(timer);
          child.stdout?.off("data", onData);
          resolvePromise(line);
          return;
        }
      }
    };
    child.stdout?.on("data", onData);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function startDaemon(workspace: string): Promise<DaemonProc> {
  const child = spawn(
    "node",
    [DAEMON_BIN, "--workspace", workspace, "--port", "0", "--mcp-port", "0"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const line = await waitForOutput(child, (l) => l.includes('"event":"ready"'));
  const parsed = JSON.parse(line) as {
    port: number;
    host: string;
    pairingUrl: string;
    sessionId: string;
    mcpUrl: string;
    mcpToken: string;
  };
  const token = new URL(parsed.pairingUrl).searchParams.get("token") ?? "";
  const ready: ReadyInfo = { ...parsed, token };
  return {
    child,
    ready,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise<void>((r) => child.once("exit", () => r()));
    },
  };
}

/**
 * Connect a WS client that stays open. Returns a `close` handle. After the
 * promise resolves, the welcome message has been received and the daemon has
 * registered the session — `activeSession` is set in the server closure.
 */
function connectWs(url: string, origin: string): Promise<{ close: () => void }> {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(url, { origin });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("ws connect timeout"));
    }, 5000);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          messageId: "mcp-test-hello-0001",
          messageType: "hello",
          payload: {
            type: "hello",
            clientVersion: PROTOCOL_VERSION,
            clientCapabilities: ["selection", "verification", "error-reporting"],
          },
          timestamp: Date.now(),
        }),
      );
    });
    ws.on("message", () => {
      clearTimeout(timer);
      resolvePromise({ close: () => ws.close() });
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** MCP JSON-RPC request body for a single tool call. */
function mcpToolCall(name: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: {} },
  });
}

/**
 * Parse the MCP HTTP response. The StreamableHTTPServerTransport returns SSE
 * format (`text/event-stream`); the JSON-RPC payload is in the `data:` line.
 * Falls back to plain JSON if the transport returns `application/json`.
 */
function parseMcpResponse(body: string): {
  readonly result?: { readonly content?: readonly { readonly text?: string }[] };
  readonly error?: { readonly message?: string };
} {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      return JSON.parse(trimmed.slice(6));
    }
  }
  return JSON.parse(body);
}

/** Extract and parse the tool result JSON from the MCP response content text. */
function extractToolResult(body: string): Record<string, unknown> {
  const parsed = parseMcpResponse(body);
  const text = parsed.result?.content?.[0]?.text;
  if (text === undefined) {
    throw new Error(`no tool result text in MCP response: ${body}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function mcpFetch(
  url: string,
  token: string,
  body: string,
): Promise<{ readonly status: number; readonly body: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body,
  });
  return { status: response.status, body: await response.text() };
}

let proc: DaemonProc;
let workspace: string;

beforeAll(async () => {
  workspace = makeWorkspace();
  proc = await startDaemon(workspace);
}, 15_000);

afterAll(async () => {
  await proc?.stop();
  if (workspace) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("daemon MCP HTTP transport", () => {
  it("prints mcpUrl and mcpToken in the ready JSON", () => {
    expect(proc.ready.mcpUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(proc.ready.mcpToken.length).toBeGreaterThan(0);
  });

  it("returns connected:false when no browser panel is connected", async () => {
    const { status, body } = await mcpFetch(
      proc.ready.mcpUrl,
      proc.ready.mcpToken,
      mcpToolCall("vision_get_active_session"),
    );
    expect(status).toBe(200);
    const result = extractToolResult(body);
    expect(result.connected).toBe(false);
  });

  it("returns connected:true after a browser panel connects via WebSocket", async () => {
    const wsUrl = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectWs(wsUrl, "http://127.0.0.1:5173");

    try {
      const { status, body } = await mcpFetch(
        proc.ready.mcpUrl,
        proc.ready.mcpToken,
        mcpToolCall("vision_get_active_session"),
      );
      expect(status).toBe(200);
      const result = extractToolResult(body);
      expect(result.connected).toBe(true);
      expect(result.sessionId).toBe(proc.ready.sessionId);
      expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
    } finally {
      ws.close();
    }
  });

  it("rejects requests with a wrong bearer token (401)", async () => {
    const { status, body } = await mcpFetch(
      proc.ready.mcpUrl,
      "wrong-token-xyz",
      mcpToolCall("vision_get_active_session"),
    );
    expect(status).toBe(401);
    expect(body).toContain("UNAUTHORIZED");
    // The 401 body must not leak the real MCP token or session ID.
    expect(body).not.toContain(proc.ready.mcpToken);
    expect(body).not.toContain(proc.ready.sessionId);
  });

  it("rejects requests without an Authorization header (401)", async () => {
    const response = await fetch(proc.ready.mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: mcpToolCall("vision_get_active_session"),
    });
    expect(response.status).toBe(401);
  });
});

describe("daemon MCP loopback guardrail", () => {
  it("refuses to start with --host 0.0.0.0 (NonLoopbackHostError)", async () => {
    const ws2 = makeWorkspace();
    const child = spawn(
      "node",
      [DAEMON_BIN, "--workspace", ws2, "--port", "0", "--mcp-port", "0", "--host", "0.0.0.0"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    const code = await new Promise<number>((r) => child.once("exit", (c) => r(c ?? 0)));
    rmSync(ws2, { recursive: true, force: true });
    expect(code).not.toBe(0);
    expect(stderr).toContain("loopback");
    expect(stderr).toContain("0.0.0.0");
  });
});
