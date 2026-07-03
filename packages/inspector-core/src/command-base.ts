/**
 * Shared infrastructure for command factories.
 *
 * Extracted from `commands.ts` so the structural and free-position factories
 * in sibling modules can reuse the same operation-base construction without
 * pushing a single file past the 250-LOC ceiling (the established split
 * pattern; see Task 4 catalog / Task 5 message-sender extractions).
 */
import type { ElementRef, OperationOrigin } from "@vision-control/change-ir";

/** Options shared by every command factory. */
export interface CommandBaseOptions {
  /** Epoch timestamp; defaults to `Date.now()`. */
  readonly timestamp?: number;
  /** Operation id; defaults to `crypto.randomUUID()`. */
  readonly id?: string;
  /**
   * Operation origin (PRD §12.4). Defaults to `"property-panel"`; canvas
   * gestures override to `"canvas-drag"`, keyboard shortcuts to `"shortcut"`,
   * MCP/agent to `"agent"`.
   */
  readonly origin?: OperationOrigin;
}

/** Base fields every factory-built operation carries. */
export interface CommandBaseFields {
  readonly id: string;
  readonly timestamp: number;
  readonly runtime: false;
  readonly origin: OperationOrigin;
  readonly confidence: number;
}

/** Generate a fresh operation id (UUID, satisfies OPERATION_ID_PATTERN). */
export function newOperationId(): string {
  return crypto.randomUUID();
}

/**
 * Build the base fields shared by every operation. `runtime: false` marks the
 * operation as a source-intent (NOT a preview mutation); `confidence: 1`
 * reflects a direct user edit.
 */
export function commandBase(options: CommandBaseOptions): CommandBaseFields {
  return {
    id: options.id ?? newOperationId(),
    timestamp: options.timestamp ?? Date.now(),
    runtime: false,
    origin: options.origin ?? "property-panel",
    confidence: 1,
  };
}

/**
 * Coerce a target into an {@link ElementRef}. Accepts a full `ElementRef`
 * (carrying `selector`/`sourceId`) or a bare `{ runtimeId }` shorthand.
 */
export function toElementRef(target: ElementRef | { readonly runtimeId: string }): ElementRef {
  return "selector" in target || "sourceId" in target
    ? (target as ElementRef)
    : { runtimeId: target.runtimeId };
}
