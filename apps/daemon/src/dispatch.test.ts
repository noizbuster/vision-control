import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RawData, WebSocket } from "ws";

const TEST_FILE = fileURLToPath(import.meta.url);
const DAEMON_BIN = resolve(dirname(TEST_FILE), "../dist/index.js");

interface ReadyInfo {
  readonly port: number;
  readonly host: string;
  readonly token: string;
  readonly sessionId: string;
}

interface ParsedEnvelope {
  readonly messageType: string;
  readonly payload: { readonly type: string; readonly [key: string]: unknown };
}

interface AuditRow {
  readonly event_json: string;
  readonly workspace_id: string;
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-dispatch-"));
  writeFileSync(
    `${dir}/vision-control.config.ts`,
    "export default { workspace: { root: '/tmp/vc-dispatch' }, origins: [] };\n",
  );
  return dir;
}

async function waitForReady(child: ChildProcess, timeoutMs = 8000): Promise<ReadyInfo> {
  return new Promise<ReadyInfo>((resolvePromise, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for daemon ready")),
      timeoutMs,
    );
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.includes('"event":"ready"')) {
          clearTimeout(timer);
          child.stdout?.off("data", onData);
          const parsed = JSON.parse(line) as {
            port: number;
            host: string;
            pairingUrl: string;
            sessionId: string;
          };
          resolvePromise({
            port: parsed.port,
            host: parsed.host,
            token: new URL(parsed.pairingUrl).searchParams.get("token") ?? "",
            sessionId: parsed.sessionId,
          });
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
  workspace: string,
): Promise<{ child: ChildProcess; ready: ReadyInfo; stop: () => Promise<void> }> {
  const child = spawn("node", [DAEMON_BIN, "--workspace", workspace, "--port", "0"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
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

function connectAndHandshake(url: string, timeoutMs = 6000): Promise<WebSocket> {
  return new Promise<WebSocket>((resolvePromise, reject) => {
    const ws = new WebSocket(url, { origin: "http://127.0.0.1:5173" });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("handshake timed out"));
    }, timeoutMs);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          messageId: "client-hello-0001",
          messageType: "hello",
          payload: {
            type: "hello",
            clientVersion: PROTOCOL_VERSION,
            clientCapabilities: ["selection", "changesets", "source-resolution", "verification"],
          },
          timestamp: Date.now(),
        }),
      );
    });
    ws.on("message", (data: RawData) => {
      const env = JSON.parse(data.toString()) as ParsedEnvelope;
      if (env.messageType === "welcome") {
        clearTimeout(timer);
        resolvePromise(ws);
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function envelope(
  messageId: string,
  messageType: string,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    messageId,
    messageType,
    payload,
    timestamp: Date.now(),
  });
}

function sendAndCollect(
  ws: WebSocket,
  raw: string,
  count: number,
  timeoutMs = 5000,
): Promise<ParsedEnvelope[]> {
  return new Promise<ParsedEnvelope[]>((resolvePromise, reject) => {
    const collected: ParsedEnvelope[] = [];
    const timer = setTimeout(() => reject(new Error("timed out waiting for replies")), timeoutMs);
    const handler = (data: RawData): void => {
      collected.push(JSON.parse(data.toString()) as ParsedEnvelope);
      if (collected.length >= count) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolvePromise(collected);
      }
    };
    ws.on("message", handler);
    ws.send(raw);
  });
}

function readAuditRowsSync(
  Module: new (
    path: string,
    opts?: { readonly?: boolean; fileMustExist?: boolean },
  ) => Database.Database,
  dbPath: string,
  action: string,
): AuditRow[] {
  const db = new Module(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db
      .prepare("SELECT event_json, workspace_id FROM audit WHERE event_json LIKE ?")
      .all(`%"action":"${action}"%`) as AuditRow[];
  } finally {
    db.close();
  }
}

let proc: { child: ChildProcess; ready: ReadyInfo; stop: () => Promise<void> };
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

describe("§25.1 business dispatch (Task 16)", () => {
  it("selection.changed → daemon persists an audit row + acks (not ack-and-discard)", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectAndHandshake(url);
    try {
      const replies = await sendAndCollect(
        ws,
        envelope("sel-dispatch-0001", "selection.changed", {
          type: "selection.changed",
          elementId: "elem-dispatch-1",
          framePath: ["main"],
        }),
        1,
      );
      expect(replies[0]?.messageType).toBe("ack");

      const dbPath = join(workspace, ".vision-control", "daemon.db");
      const DatabaseModule = (await import("better-sqlite3")) as unknown as {
        default: new (
          path: string,
          opts?: { readonly?: boolean; fileMustExist?: boolean },
        ) => Database.Database;
      };
      const rows = readAuditRowsSync(DatabaseModule.default, dbPath, "selection-changed");
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const event = JSON.parse(rows[0]?.event_json ?? "{}") as { action?: string; target?: string };
      expect(event.action).toBe("selection-changed");
      expect(event.target).toBe("elem-dispatch-1");
    } finally {
      ws.close();
    }
  }, 12_000);

  it("source.request for an unknown element → source.resolved with non-HIGH confidence (never-wrong-HIGH)", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectAndHandshake(url);
    try {
      const replies = await sendAndCollect(
        ws,
        envelope("src-dispatch-0001", "source.request", {
          type: "source.request",
          requestId: "req-dispatch-1",
          elementId: "no-such-marker-element",
        }),
        2,
      );
      const resolved = replies.find((r) => r.messageType === "source.resolved");
      expect(resolved).toBeDefined();
      if (resolved === undefined) return;
      expect(resolved.payload.requestId).toBe("req-dispatch-1");
      expect(resolved.payload.confidence).not.toBe("high");
    } finally {
      ws.close();
    }
  }, 12_000);

  it("malformed JSON → typed INVALID_PAYLOAD error envelope, connection survives (no crash)", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectAndHandshake(url);
    try {
      const errorReply = await new Promise<ParsedEnvelope>((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 5000);
        const handler = (data: RawData): void => {
          clearTimeout(timer);
          ws.off("message", handler);
          resolvePromise(JSON.parse(data.toString()) as ParsedEnvelope);
        };
        ws.on("message", handler);
        ws.send("{not valid json");
      });
      expect(errorReply.messageType).toBe("error");
      expect(errorReply.payload.code).toBe("INVALID_PAYLOAD");

      // The connection must still be usable: a follow-up valid message acks.
      const followup = await sendAndCollect(
        ws,
        envelope("diag-survive-0001", "diagnostic.reported", {
          type: "diagnostic.reported",
          severity: "info",
          message: "connection still alive",
        }),
        1,
      );
      expect(followup[0]?.messageType).toBe("ack");
    } finally {
      ws.close();
    }
  }, 12_000);

  it("diagnostic.reported → audit row (log + audit)", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectAndHandshake(url);
    try {
      const replies = await sendAndCollect(
        ws,
        envelope("diag-dispatch-0001", "diagnostic.reported", {
          type: "diagnostic.reported",
          severity: "warning",
          message: "preview-only property overridden",
          elementId: "elem-diag-1",
        }),
        1,
      );
      expect(replies[0]?.messageType).toBe("ack");

      const dbPath = join(workspace, ".vision-control", "daemon.db");
      const DatabaseModule = (await import("better-sqlite3")) as unknown as {
        default: new (
          path: string,
          opts?: { readonly?: boolean; fileMustExist?: boolean },
        ) => Database.Database;
      };
      const rows = readAuditRowsSync(DatabaseModule.default, dbPath, "diagnostic-reported");
      expect(rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 12_000);

  it("verification.runtimeResult → audit row recording the outcome", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectAndHandshake(url);
    try {
      const replies = await sendAndCollect(
        ws,
        envelope("vrr-dispatch-0001", "verification.runtimeResult", {
          type: "verification.runtimeResult",
          changesetId: "cs-vrr-1",
          passed: true,
        }),
        1,
      );
      expect(replies[0]?.messageType).toBe("ack");

      const dbPath = join(workspace, ".vision-control", "daemon.db");
      const DatabaseModule = (await import("better-sqlite3")) as unknown as {
        default: new (
          path: string,
          opts?: { readonly?: boolean; fileMustExist?: boolean },
        ) => Database.Database;
      };
      const rows = readAuditRowsSync(DatabaseModule.default, dbPath, "runtime-result");
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const event = JSON.parse(rows[0]?.event_json ?? "{}") as {
        action?: string;
        target?: string;
        outcome?: string;
      };
      expect(event.action).toBe("runtime-result");
      expect(event.target).toBe("cs-vrr-1");
      expect(event.outcome).toBe("success");
    } finally {
      ws.close();
    }
  }, 12_000);

  it("page.navigated → audit row", async () => {
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectAndHandshake(url);
    try {
      const replies = await sendAndCollect(
        ws,
        envelope("pn-dispatch-0001", "page.navigated", {
          type: "page.navigated",
          url: "https://localhost:5173/about",
          title: "About",
          framePath: ["main"],
        }),
        1,
      );
      expect(replies[0]?.messageType).toBe("ack");

      const dbPath = join(workspace, ".vision-control", "daemon.db");
      const DatabaseModule = (await import("better-sqlite3")) as unknown as {
        default: new (
          path: string,
          opts?: { readonly?: boolean; fileMustExist?: boolean },
        ) => Database.Database;
      };
      const rows = readAuditRowsSync(DatabaseModule.default, dbPath, "page-navigated");
      expect(rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 12_000);
});
