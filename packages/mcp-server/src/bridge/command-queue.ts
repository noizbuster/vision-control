/**
 * MCP → extension command queue (ADR-020 C5 coordination).
 *
 * Tools enqueue clear_preview / request_verification / patch markers.
 * Extension acks via command.ack. MCP never mutates source or journal.
 */

import type { BridgeCommandKind } from "@vision-control/protocol";

export interface QueuedCommand {
  readonly commandId: string;
  readonly kind: BridgeCommandKind;
  readonly tabId: string | undefined;
  readonly patchId: string | undefined;
  readonly description: string | undefined;
  readonly success: boolean | undefined;
  readonly changesetId: string | undefined;
  readonly enqueuedAt: number;
  readonly status: "pending" | "acked" | "failed";
  readonly ackReason: string | undefined;
}

export interface EnqueueCommandInput {
  readonly kind: BridgeCommandKind;
  readonly tabId?: string;
  readonly patchId?: string;
  readonly description?: string;
  readonly success?: boolean;
  readonly changesetId?: string;
}

export interface CommandQueue {
  enqueue(input: EnqueueCommandInput, now: number): QueuedCommand;
  ack(commandId: string, ok: boolean, reason?: string): QueuedCommand | undefined;
  get(commandId: string): QueuedCommand | undefined;
  pending(): readonly QueuedCommand[];
  clear(): void;
}

export function createCommandQueue(options?: { readonly uuid?: () => string }): CommandQueue {
  const uuid = options?.uuid ?? (() => globalThis.crypto.randomUUID());
  const byId = new Map<string, QueuedCommand>();

  return {
    enqueue(input: EnqueueCommandInput, now: number): QueuedCommand {
      const command: QueuedCommand = {
        commandId: uuid(),
        kind: input.kind,
        tabId: input.tabId,
        patchId: input.patchId,
        description: input.description,
        success: input.success,
        changesetId: input.changesetId,
        enqueuedAt: now,
        status: "pending",
        ackReason: undefined,
      };
      byId.set(command.commandId, command);
      return command;
    },

    ack(commandId: string, ok: boolean, reason?: string): QueuedCommand | undefined {
      const existing = byId.get(commandId);
      if (existing === undefined) return undefined;
      const updated: QueuedCommand = {
        ...existing,
        status: ok ? "acked" : "failed",
        ackReason: reason,
      };
      byId.set(commandId, updated);
      return updated;
    },

    get(commandId: string): QueuedCommand | undefined {
      return byId.get(commandId);
    },

    pending(): readonly QueuedCommand[] {
      return [...byId.values()].filter((c) => c.status === "pending");
    },

    clear(): void {
      byId.clear();
    },
  };
}
