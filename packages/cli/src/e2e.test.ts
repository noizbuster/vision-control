/**
 * End-to-end CLI data-command tests against a REAL daemon (Task 15).
 *
 * Spawns `apps/daemon/dist/index.js --mcp-port 0`, waits for the ready JSON,
 * connects a browser-shaped WebSocket panel so the daemon registers an active
 * session, then drives the public `runCli` entry point with `VC_MCP_URL` /
 * `VC_MCP_TOKEN` and asserts on real daemon-compiled content. Also covers the
 * daemon-down path: an unreachable MCP endpoint yields a clear error and a
 * non-zero exit code.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { runCli } from "./index.js";

const TEST_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(TEST_FILE), "../../..");
const DAEMON_BIN = resolve(REPO_ROOT, "apps/daemon/dist/index.js");

interface ReadyInfo {
  readonly port: number;
  readonly host: string;
  readonly pairingToken: string;
  readonly mcpUrl: string;
  readonly mcpToken: string;
}

interface DaemonProc {
  readonly child: ChildProcess;
  readonly ready: ReadyInfo;
  readonly stop: () => Promise<void>;
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

const DEAD_MCP_URL = "http://127.0.0.1:1/mcp";

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-cli-e2e-"));
  writeFileSync(
    `${dir}/vision-control.config.ts`,
    "export default { workspace: { root: '/tmp/vc-cli-e2e' }, origins: [] };\n",
  );
  return dir;
}

async function waitForReady(child: ChildProcess, timeoutMs = 15_000): Promise<ReadyInfo> {
  return new Promise<ReadyInfo>((resolveReady, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for daemon ready line"));
    }, timeoutMs);
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.includes('"event":"ready"')) continue;
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        const parsed = JSON.parse(line) as {
          port: number;
          host: string;
          pairingUrl: string;
          mcpUrl: string;
          mcpToken: string;
        };
        const pairingToken = new URL(parsed.pairingUrl).searchParams.get("token") ?? "";
        resolveReady({ ...parsed, pairingToken });
        return;
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
  const ready = await waitForReady(child);
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
 * Connect a browser-shaped WS panel and complete the hello/welcome handshake.
 * Resolved handle keeps the socket OPEN so the daemon's `activeSession` stays
 * set while the CLI queries run. Caller must `close()` when done.
 */
function connectPanel(ready: ReadyInfo): Promise<{ close: () => void }> {
  return new Promise<{ close: () => void }>((resolvePanel, reject) => {
    const url = `ws://127.0.0.1:${ready.port}/?token=${ready.pairingToken}`;
    const ws = new WebSocket(url, { origin: "http://127.0.0.1:5173" });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("ws handshake timeout"));
    }, 5000);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          messageId: "cli-e2e-hello-0001",
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
      resolvePanel({ close: () => ws.close() });
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Run `runCli(argv)` with the given env, capturing stdout/stderr/exit-code. */
async function runCapture(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<Captured> {
  const savedEnv = { ...process.env };
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const tap = (sink: string[]): typeof process.stdout.write => {
    const fn = (data: Uint8Array | string): boolean => {
      sink.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
      return true;
    };
    return fn as typeof process.stdout.write;
  };
  process.stdout.write = tap(stdoutChunks);
  process.stderr.write = tap(stderrChunks);
  try {
    Object.assign(process.env, env);
    const code = await runCli(argv);
    return { stdout: stdoutChunks.join(""), stderr: stderrChunks.join(""), code };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.env = savedEnv;
  }
}

let proc: DaemonProc;
let workspace: string;

beforeAll(async () => {
  if (!existsSync(DAEMON_BIN)) {
    throw new Error(
      `daemon binary not found at ${DAEMON_BIN}. Run "pnpm nx run daemon:build" first.`,
    );
  }
  workspace = makeWorkspace();
  proc = await startDaemon(workspace);
}, 20_000);

afterAll(async () => {
  await proc?.stop();
  if (workspace !== undefined) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("cli e2e against a live daemon", () => {
  it("returns real compiled context markdown (not 'no daemon connected')", async () => {
    const panel = await connectPanel(proc.ready);
    try {
      const captured = await runCapture(["context", "current", "--format", "markdown"], {
        VC_MCP_URL: proc.ready.mcpUrl,
        VC_MCP_TOKEN: proc.ready.mcpToken,
      });
      expect(captured.code).toBe(0);
      expect(captured.stdout).toContain("# Agent Context");
      // The stub fallback (stdio binary, VC_DAEMON_URL unset) carries this
      // exact phrase; a real daemon never does.
      expect(captured.stdout).not.toContain("no daemon connected");
      expect(captured.stdout.length).toBeGreaterThan(0);
    } finally {
      panel.close();
    }
  }, 12_000);

  it("sessions list returns real active-session data once a panel connects", async () => {
    const panel = await connectPanel(proc.ready);
    try {
      const captured = await runCapture(["sessions", "list"], {
        VC_MCP_URL: proc.ready.mcpUrl,
        VC_MCP_TOKEN: proc.ready.mcpToken,
      });
      expect(captured.code).toBe(0);
      expect(captured.stdout).toContain('"connected": true');
      expect(captured.stdout).not.toContain("no daemon connected");
    } finally {
      panel.close();
    }
  }, 12_000);

  it("changes current returns real (possibly empty) changeset JSON", async () => {
    const panel = await connectPanel(proc.ready);
    try {
      const captured = await runCapture(["changes", "current"], {
        VC_MCP_URL: proc.ready.mcpUrl,
        VC_MCP_TOKEN: proc.ready.mcpToken,
      });
      expect(captured.code).toBe(0);
      expect(captured.stdout).toContain('"operations"');
      expect(captured.stdout).not.toContain("no daemon connected");
    } finally {
      panel.close();
    }
  }, 12_000);
});

describe("cli e2e daemon-down path", () => {
  it("exits non-zero with a clear error when the daemon is unreachable", async () => {
    const captured = await runCapture(["sessions", "list"], {
      VC_MCP_URL: DEAD_MCP_URL,
      VC_MCP_TOKEN: "any-token",
    });
    expect(captured.code).not.toBe(0);
    expect(captured.stderr.length).toBeGreaterThan(0);
    // Clear, honest error — never a silent "no data" or fabricated output.
    expect(captured.stderr.toLowerCase()).toMatch(/connection failed|econnrefused|fetch failed/);
    expect(captured.stdout).not.toContain("no daemon connected");
  }, 8_000);
});
