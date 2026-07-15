import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePairingUrl,
  synthesizePairingUrlFromHttpPairPage,
  toWebSocketUrl,
} from "@vision-control/daemon-client";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

const TEST_FILE = fileURLToPath(import.meta.url);
const DAEMON_BIN = resolve(dirname(TEST_FILE), "../dist/index.js");

interface ReadyInfo {
  port: number;
  host: string;
  pairingUrl: string;
  pairingHttpUrl: string;
  sessionId: string;
  token: string;
}

interface DaemonProc {
  child: ChildProcess;
  ready: ReadyInfo;
  stop: () => Promise<void>;
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-int-"));
  writeFileSync(
    `${dir}/vision-control.config.ts`,
    "export default { workspace: { root: '/tmp/vc-int' }, origins: [] };\n",
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

async function startDaemon(
  args: readonly string[],
  workspace: string,
  expectReady = true,
): Promise<DaemonProc> {
  const child = spawn(
    "node",
    [DAEMON_BIN, "--workspace", workspace, "--port", "0", "--no-open", ...args],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (!expectReady) {
    return {
      child,
      ready: {
        port: 0,
        host: "",
        pairingUrl: "",
        pairingHttpUrl: "",
        sessionId: "",
        token: "",
      },
      stop: async () => {
        child.kill();
        await new Promise<void>((r) => child.once("exit", () => r()));
      },
    };
  }
  const line = await waitForOutput(child, (l) => l.includes('"event":"ready"'));
  const parsed = JSON.parse(line) as {
    port: number;
    host: string;
    pairingUrl: string;
    pairingHttpUrl: string;
    sessionId: string;
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

function wsConnect(
  url: string,
  origin?: string,
  timeoutMs = 4000,
): Promise<{ opened: boolean; code?: number; firstMessage?: string }> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const ws = origin ? new WebSocket(url, { origin }) : new WebSocket(url);
    let firstMessage: string | undefined;
    const timer = setTimeout(() => finish({ opened: false, code: -1 }), timeoutMs);
    const finish = (result: { opened: boolean; code?: number; firstMessage?: string }): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // already closed
        }
        resolvePromise(result);
      }
    };
    ws.on("open", () => {
      const hello = {
        protocolVersion: PROTOCOL_VERSION,
        messageId: "client-hello-0001",
        messageType: "hello",
        payload: {
          type: "hello",
          clientVersion: PROTOCOL_VERSION,
          clientCapabilities: ["selection", "verification", "error-reporting"],
        },
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(hello));
    });
    ws.on("message", (data) => {
      firstMessage = data.toString();
      finish({ opened: true, firstMessage });
    });
    ws.on("error", () => {
      finish({ opened: false });
    });
    ws.on("close", (code) => {
      finish({ opened: false, code: code ?? undefined });
    });
  });
}

let proc: DaemonProc;
let workspace: string;

beforeAll(async () => {
  workspace = makeWorkspace();
  proc = await startDaemon([], workspace);
}, 15_000);

afterAll(async () => {
  await proc?.stop();
  if (workspace) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("daemon live server", () => {
  it("binds to loopback and prints a ready event", () => {
    expect(proc.ready.host).toBe("127.0.0.1");
    expect(proc.ready.port).toBeGreaterThan(0);
    expect(proc.ready.token.length).toBeGreaterThan(0);
  });

  it("ready JSON includes pairingHttpUrl with same token and /pair path", () => {
    expect(proc.ready.pairingHttpUrl.length).toBeGreaterThan(0);
    expect(proc.ready.pairingUrl.length).toBeGreaterThan(0);
    const http = new URL(proc.ready.pairingHttpUrl);
    const deep = new URL(proc.ready.pairingUrl);
    expect(http.pathname).toBe("/pair");
    expect(http.hostname).toBe("127.0.0.1");
    expect(http.port).toBe(String(proc.ready.port));
    expect(http.searchParams.get("token")).toBe(proc.ready.token);
    expect(deep.searchParams.get("token")).toBe(proc.ready.token);
    expect(http.searchParams.get("token")).toBe(deep.searchParams.get("token"));
  });

  it("happy path: a valid token completes the handshake with a welcome", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const result = await wsConnect(url, "http://127.0.0.1:5173");
    expect(result.opened).toBe(true);
    expect(result.firstMessage).toBeDefined();
    const env = JSON.parse(result.firstMessage ?? "{}");
    expect(env.messageType).toBe("welcome");
    expect(env.payload.type).toBe("welcome");
  });

  it("GET pairingHttpUrl returns 200 HTML with security headers", async () => {
    const response = await fetch(proc.ready.pairingHttpUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html;\s*charset=utf-8/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await response.text();
    expect(body).toContain("vision-control://pair?");
    expect(body).toContain(proc.ready.token);
  });

  it("client path: synthesize pairingHttpUrl → parse → WS welcome", async () => {
    const synthesized = synthesizePairingUrlFromHttpPairPage(proc.ready.pairingHttpUrl);
    expect(synthesized.success).toBe(true);
    if (!synthesized.success) {
      return;
    }
    const parsed = parsePairingUrl(synthesized.pairingUrl);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.target.token).toBe(proc.ready.token);
    expect(parsed.target.port).toBe(proc.ready.port);
    expect(parsed.target.host).toBe(proc.ready.host);

    const wsUrl = toWebSocketUrl(parsed.target);
    const result = await wsConnect(wsUrl, "http://127.0.0.1:5173");
    expect(result.opened).toBe(true);
    expect(result.firstMessage).toBeDefined();
    const env = JSON.parse(result.firstMessage ?? "{}") as {
      messageType?: string;
      payload?: { type?: string };
    };
    expect(env.messageType).toBe("welcome");
    expect(env.payload?.type).toBe("welcome");
  });

  it("GET /pair without token returns 400 with security headers", async () => {
    const response = await fetch(`http://127.0.0.1:${proc.ready.port}/pair`);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain("<html");
  });

  it("negative 1: no token is rejected (no open)", async () => {
    const result = await wsConnect(`ws://127.0.0.1:${proc.ready.port}/`);
    expect(result.opened).toBe(false);
  });

  it("negative 2: a wrong token is rejected (no open)", async () => {
    const result = await wsConnect(`ws://127.0.0.1:${proc.ready.port}/?token=wrong`);
    expect(result.opened).toBe(false);
  });

  it("negative 3: a disallowed origin is rejected (no open)", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const result = await wsConnect(url, "https://evil.example.com");
    expect(result.opened).toBe(false);
  });
});

describe("daemon CLI guardrails", () => {
  it("negative 4: --host 0.0.0.0 is refused (no public bind, non-zero exit)", async () => {
    const ws2 = makeWorkspace();
    const child = spawn(
      "node",
      [DAEMON_BIN, "--workspace", ws2, "--port", "0", "--host", "0.0.0.0", "--no-open"],
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

  it("negative 5: --help prints help and exits 0 without binding", async () => {
    const child = spawn("node", [DAEMON_BIN, "--help"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    const code = await new Promise<number>((r) => child.once("exit", (c) => r(c ?? 0)));
    expect(code).toBe(0);
    expect(stdout).toContain("Usage");
    expect(stdout).not.toContain('"event":"ready"');
  });

  it("non-TTY spawn with --no-open reaches ready without open failure noise", async () => {
    const ws3 = makeWorkspace();
    const child = spawn(
      "node",
      [DAEMON_BIN, "--workspace", ws3, "--port", "0", "--no-open"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    const line = await waitForOutput(child, (l) => l.includes('"event":"ready"'));
    const parsed = JSON.parse(line) as { pairingHttpUrl?: string; event?: string };
    expect(parsed.event).toBe("ready");
    expect(typeof parsed.pairingHttpUrl).toBe("string");
    expect(parsed.pairingHttpUrl?.length).toBeGreaterThan(0);
    expect(stderr).not.toContain("failed to open pairing page");
    child.kill("SIGTERM");
    await new Promise<void>((r) => child.once("exit", () => r()));
    rmSync(ws3, { recursive: true, force: true });
  });
});
