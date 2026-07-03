import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RawData, WebSocket } from "ws";

const TEST_FILE = fileURLToPath(import.meta.url);
const DAEMON_BIN = resolve(dirname(TEST_FILE), "../dist/index.js");
const INDEX_SOURCE = resolve(dirname(TEST_FILE), "./index.ts");

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

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-cs-"));
  writeFileSync(
    `${dir}/vision-control.config.ts`,
    "export default { workspace: { root: '/tmp/vc-cs' }, origins: [] };\n",
  );
  return dir;
}

async function waitForReady(child: ChildProcess, timeoutMs = 8000): Promise<ReadyInfo> {
  return new Promise<ReadyInfo>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for daemon ready"));
    }, timeoutMs);
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
          const token = new URL(parsed.pairingUrl).searchParams.get("token") ?? "";
          resolvePromise({
            port: parsed.port,
            host: parsed.host,
            token,
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

function sendAndWait(ws: WebSocket, message: object, timeoutMs = 5000): Promise<ParsedEnvelope> {
  return new Promise<ParsedEnvelope>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for reply")), timeoutMs);
    const handler = (data: RawData): void => {
      clearTimeout(timer);
      ws.off("message", handler);
      resolvePromise(JSON.parse(data.toString()) as ParsedEnvelope);
    };
    ws.on("message", handler);
    ws.send(JSON.stringify(message));
  });
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

describe("changeset persistence (Task 12)", () => {
  it("persists a changeset.updated payload to the changesets SQLite table", async () => {
    // Given: an authenticated, handshaken WebSocket session.
    const url = `ws://127.0.0.1:${proc.ready.port}/?token=${proc.ready.token}`;
    const ws = await connectAndHandshake(url);

    try {
      // When: the client sends changeset.updated with real operations.
      const operations = [
        { kind: "set-style", property: "color", value: "red" },
        { kind: "set-text", value: "hello" },
      ];
      const reply = await sendAndWait(ws, {
        protocolVersion: PROTOCOL_VERSION,
        messageId: "msg-changeset-0001",
        messageType: "changeset.updated",
        payload: {
          type: "changeset.updated",
          changesetId: "cs-test-0001",
          revision: 1,
          operations,
        },
        timestamp: Date.now(),
      });

      // Then: the daemon acknowledges (persist ran before the ack was sent).
      expect(reply.messageType).toBe("ack");

      // And: the SQLite changesets table holds a row with the operations.
      const dbPath = join(workspace, ".vision-control", "daemon.db");
      const DatabaseModule = (await import("better-sqlite3")) as {
        default: new (
          path: string,
          opts?: { readonly?: boolean; fileMustExist?: boolean },
        ) => Database.Database;
      };
      const db = new DatabaseModule.default(dbPath, { readonly: true, fileMustExist: true });
      try {
        const rows = db
          .prepare("SELECT * FROM changesets WHERE session_id = ? ORDER BY created_at")
          .all(proc.ready.sessionId) as Array<{
          operations_json: string;
          session_id: string;
          workspace_id: string;
        }>;
        expect(rows.length).toBeGreaterThanOrEqual(1);
        const first = rows[0];
        if (first === undefined) throw new Error("expected a changeset row but found none");
        const stored = JSON.parse(first.operations_json) as unknown[];
        expect(Array.isArray(stored)).toBe(true);
        expect(stored).toHaveLength(2);
        expect(stored[0]).toMatchObject({ kind: "set-style", property: "color", value: "red" });
        expect(stored[1]).toMatchObject({ kind: "set-text", value: "hello" });
      } finally {
        db.close();
      }
    } finally {
      ws.close();
    }
  }, 12_000);

  it("does not silence changesetRepo or sourceRepo with void (regression guard)", () => {
    const source = readFileSync(INDEX_SOURCE, "utf8");
    expect(source).not.toContain("void changesetRepo");
    expect(source).not.toContain("void sourceRepo");
  });
});
