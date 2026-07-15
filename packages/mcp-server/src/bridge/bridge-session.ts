/**
 * Paired bridge session: parse extension messages, update projection cache,
 * deliver command.enqueue, accept command.ack (ADR-020).
 */

import {
  type VisionContextSnapshot,
  VisionContextSnapshotSchema,
} from "@vision-control/context-compiler";
import {
  type CommandEnqueue,
  PROTOCOL_VERSION,
  type ProtocolEnvelope,
  parseEnvelope,
  parseMessage,
} from "@vision-control/protocol";
import type { WebSocket } from "ws";

import type { CommandQueue } from "./command-queue.js";
import type { ProjectionCache } from "./projection-cache.js";

export interface BridgeSessionOptions {
  readonly cache: ProjectionCache;
  readonly commands: CommandQueue;
  readonly now?: () => number;
  readonly uuid?: () => string;
}

export interface BridgeSession {
  /** Attach a newly paired WebSocket. */
  attach(socket: WebSocket): void;
  /** Detach and clear live state. */
  detach(): void;
  /** Whether a socket is currently attached. */
  isAttached(): boolean;
  /**
   * Enqueue + send command.enqueue. Returns false when no socket.
   */
  sendCommand(payload: Omit<CommandEnqueue, "type">): boolean;
}

export function createBridgeSession(options: BridgeSessionOptions): BridgeSession {
  const { cache, commands } = options;
  const now = options.now ?? Date.now;
  const uuid = options.uuid ?? (() => globalThis.crypto.randomUUID());
  let socket: WebSocket | undefined;

  const handleRaw = (raw: string): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const envResult = parseEnvelope(parsed);
    if (!envResult.success) return;
    const msgResult = parseMessage(envResult.data.payload);
    if (!msgResult.success) return;
    const msg = msgResult.data;
    const t = now();

    switch (msg.type) {
      case "session.heartbeat":
        cache.noteHeartbeat(t);
        return;
      case "snapshot.push": {
        const snapResult = VisionContextSnapshotSchema.safeParse(msg.snapshot);
        if (!snapResult.success) return;
        const snapshot = snapResult.data;
        if (snapshot.snapshotRev !== msg.snapshotRev) return;
        if (snapshot.tabId !== undefined && snapshot.tabId !== msg.tabId) return;
        cache.ingest({
          tabId: msg.tabId,
          sessionId: msg.sessionId ?? snapshot.sessionId,
          snapshotRev: msg.snapshotRev,
          snapshot,
          ingestedAt: t,
        });
        return;
      }
      case "command.ack":
        commands.ack(msg.commandId, msg.ok, msg.reason);
        return;
      default:
        return;
    }
  };

  return {
    attach(ws: WebSocket): void {
      if (socket !== undefined) {
        socket.removeAllListeners();
        socket.close(1000, "replaced");
      }
      socket = ws;
      cache.markPaired(now());
      ws.on("message", (data) => {
        const text = typeof data === "string" ? data : data.toString("utf8");
        handleRaw(text);
      });
      ws.on("close", () => {
        if (socket === ws) {
          socket = undefined;
          cache.markUnpaired();
          commands.clear();
        }
      });
    },

    detach(): void {
      if (socket !== undefined) {
        socket.removeAllListeners();
        socket.close(1000, "session detach");
        socket = undefined;
      }
      cache.markUnpaired();
      commands.clear();
    },

    isAttached(): boolean {
      return socket !== undefined && socket.readyState === socket.OPEN;
    },

    sendCommand(payload: Omit<CommandEnqueue, "type">): boolean {
      if (socket === undefined || socket.readyState !== socket.OPEN) {
        return false;
      }
      const message: CommandEnqueue = { type: "command.enqueue", ...payload };
      const envelope: ProtocolEnvelope = {
        protocolVersion: PROTOCOL_VERSION,
        messageId: uuid(),
        messageType: "command.enqueue",
        tabId: payload.tabId,
        payload: message,
        timestamp: now(),
      };
      socket.send(JSON.stringify(envelope));
      return true;
    },
  };
}

/** Build a minimal valid snapshot for tests / drivers. */
export function minimalSnapshot(input: {
  readonly tabId: string;
  readonly snapshotRev: number;
  readonly sessionId?: string;
  readonly selectionTag?: string;
}): VisionContextSnapshot {
  const tag = input.selectionTag ?? "div";
  const withSelection = input.selectionTag !== undefined;
  const raw: Record<string, unknown> = {
    formatVersion: "1.0.0",
    snapshotRev: input.snapshotRev,
    tabId: input.tabId,
    compiledAt: 1_700_000_000_000,
    operations: [],
    journal: {
      entryCount: 0,
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
      recentKinds: [],
    },
    origins: [],
    originsTruncated: false,
    privacyReport: { redactions: [], totalRedacted: 0 },
    warnings: [],
  };
  if (input.sessionId !== undefined) {
    raw.sessionId = input.sessionId;
  }
  if (withSelection) {
    raw.selection = {
      identity: {
        sourceId: `src-${input.tabId}`,
        selectors: [`${tag.toLowerCase()}.primary`],
      },
      semantic: {
        tagName: tag,
        textContentPreview: "hello",
      },
      breadcrumb: [{ tagName: tag }],
      computedStyle: {},
      boxModel: {
        contentWidth: 10,
        contentHeight: 10,
        positionX: 0,
        positionY: 0,
      },
      classList: [],
      attributes: [],
    };
  }
  return VisionContextSnapshotSchema.parse(raw);
}
