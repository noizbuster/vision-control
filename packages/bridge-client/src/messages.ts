/**
 * Helpers for ADR-020 bridge message payloads (extension → MCP).
 * Background-only; content scripts must never open the MCP socket.
 */

import {
  type CommandAck,
  PROTOCOL_VERSION,
  type ProtocolEnvelope,
  type SessionHeartbeat,
  type SnapshotPush,
  type VerificationResult,
} from "@vision-control/protocol";

export interface BuildEnvelopeOptions {
  readonly messageId: string;
  readonly timestamp: number;
  readonly tabId?: string;
  readonly sessionId?: string;
}

export function buildSnapshotPushPayload(input: {
  readonly tabId: string;
  readonly snapshotRev: number;
  readonly sessionId?: string;
  readonly snapshot: unknown;
}): SnapshotPush {
  const payload: SnapshotPush = {
    type: "snapshot.push",
    tabId: input.tabId,
    snapshotRev: input.snapshotRev,
    snapshot: input.snapshot,
  };
  if (input.sessionId !== undefined) {
    return { ...payload, sessionId: input.sessionId };
  }
  return payload;
}

export function buildCommandAckPayload(input: {
  readonly commandId: string;
  readonly ok: boolean;
  readonly reason?: string;
  readonly tabId?: string;
}): CommandAck {
  const payload: CommandAck = {
    type: "command.ack",
    commandId: input.commandId,
    ok: input.ok,
  };
  if (input.reason !== undefined) {
    return {
      ...payload,
      reason: input.reason,
      ...(input.tabId !== undefined ? { tabId: input.tabId } : {}),
    };
  }
  if (input.tabId !== undefined) {
    return { ...payload, tabId: input.tabId };
  }
  return payload;
}

export function buildHeartbeatPayload(clientTime: number): SessionHeartbeat {
  return { type: "session.heartbeat", clientTime };
}

export function buildVerificationResultPayload(input: {
  readonly tabId: string;
  readonly sessionId?: string;
  readonly ts: number;
  readonly passed: boolean;
  readonly details: unknown;
  readonly commandId?: string;
}): VerificationResult {
  const payload: VerificationResult = {
    type: "verification.result",
    tabId: input.tabId,
    ts: input.ts,
    passed: input.passed,
    details: input.details,
  };
  return {
    ...payload,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.commandId !== undefined ? { commandId: input.commandId } : {}),
  };
}

export function wrapBridgeEnvelope(
  messageType: string,
  payload: unknown,
  options: BuildEnvelopeOptions,
): ProtocolEnvelope {
  const envelope: ProtocolEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    messageId: options.messageId,
    messageType,
    payload,
    timestamp: options.timestamp,
  };
  if (options.tabId !== undefined) {
    return {
      ...envelope,
      tabId: options.tabId,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    };
  }
  if (options.sessionId !== undefined) {
    return { ...envelope, sessionId: options.sessionId };
  }
  return envelope;
}
