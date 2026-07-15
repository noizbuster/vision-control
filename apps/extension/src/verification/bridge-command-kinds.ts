import type { BridgeCommandKind } from "@vision-control/protocol";

export type CoordinationCommandKind = BridgeCommandKind;

export interface BridgeCommandPayload {
  readonly commandId: string;
  readonly kind: CoordinationCommandKind;
  readonly tabId?: string;
  readonly patchId?: string;
  readonly description?: string;
  readonly success?: boolean;
  readonly changesetId?: string;
  readonly operations?: readonly unknown[];
}

export type CommandDispatchResult =
  | { readonly kind: "clear_preview" }
  | { readonly kind: "request_verification"; readonly operations: readonly unknown[] }
  | {
      readonly kind: "mark_patch_started";
      readonly patchId: string;
      readonly description: string | undefined;
    }
  | {
      readonly kind: "mark_patch_completed";
      readonly patchId: string;
      readonly success: boolean;
    }
  | { readonly kind: "unsupported"; readonly reason: string };

export function parseBridgeCommandPayload(payload: unknown): BridgeCommandPayload | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.commandId !== "string" || obj.commandId.length === 0) return undefined;
  if (typeof obj.kind !== "string") return undefined;
  const kind = obj.kind;
  if (
    kind !== "clear_preview" &&
    kind !== "request_verification" &&
    kind !== "mark_patch_started" &&
    kind !== "mark_patch_completed"
  ) {
    return undefined;
  }
  const result: {
    commandId: string;
    kind: CoordinationCommandKind;
    tabId?: string;
    patchId?: string;
    description?: string;
    success?: boolean;
    changesetId?: string;
    operations?: readonly unknown[];
  } = {
    commandId: obj.commandId,
    kind,
  };
  if (typeof obj.tabId === "string") result.tabId = obj.tabId;
  if (typeof obj.patchId === "string") result.patchId = obj.patchId;
  if (typeof obj.description === "string") result.description = obj.description;
  if (typeof obj.success === "boolean") result.success = obj.success;
  if (typeof obj.changesetId === "string") result.changesetId = obj.changesetId;
  if (Array.isArray(obj.operations)) result.operations = obj.operations;
  return result;
}

export function dispatchCommandKind(command: BridgeCommandPayload): CommandDispatchResult {
  switch (command.kind) {
    case "clear_preview":
      return { kind: "clear_preview" };
    case "request_verification":
      return {
        kind: "request_verification",
        operations: command.operations ?? [],
      };
    case "mark_patch_started":
      if (command.patchId === undefined) {
        return { kind: "unsupported", reason: "missing_patchId" };
      }
      return {
        kind: "mark_patch_started",
        patchId: command.patchId,
        description: command.description ?? undefined,
      };
    case "mark_patch_completed":
      if (command.patchId === undefined || command.success === undefined) {
        return { kind: "unsupported", reason: "missing_patch_fields" };
      }
      return {
        kind: "mark_patch_completed",
        patchId: command.patchId,
        success: command.success,
      };
    default: {
      const _exhaustive: never = command.kind;
      return { kind: "unsupported", reason: `unknown:${String(_exhaustive)}` };
    }
  }
}
