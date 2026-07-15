import { z } from "zod";

/**
 * ADR-020 bridge messages (extension ↔ MCP projection).
 *
 * Distinct from the §25 daemon catalog: these ride the optional MCP bridge
 * WebSocket after pair. Protocol stays free of context-compiler imports —
 * snapshot body is opaque `unknown` here; MCP validates with
 * VisionContextSnapshotSchema at the projection boundary.
 */

/** Coordination command kinds enqueued by MCP for the extension (C5). */
export const BridgeCommandKindSchema = z.enum([
  "clear_preview",
  "request_verification",
  "mark_patch_started",
  "mark_patch_completed",
]);
export type BridgeCommandKind = z.infer<typeof BridgeCommandKindSchema>;

/**
 * Extension → MCP: push a portable context snapshot.
 * `snapshotRev` is monotonic per tab (ADR-020).
 */
export const SnapshotPushSchema = z.object({
  type: z.literal("snapshot.push"),
  tabId: z.string().min(1),
  /**
   * Monotonic revision for this tab. Must match `snapshot.snapshotRev` when
   * the opaque body is a VisionContextSnapshot.
   */
  snapshotRev: z.number().int().nonnegative(),
  sessionId: z.string().min(1).optional(),
  /**
   * Portable VisionContextSnapshot (opaque at the protocol layer).
   * MCP parses with VisionContextSnapshotSchema; never invents selection.
   */
  snapshot: z.unknown(),
});
export type SnapshotPush = z.infer<typeof SnapshotPushSchema>;

/**
 * MCP → extension: enqueue a coordination command (clear preview, verify,
 * patch markers). Does not write source or mutate the journal from MCP.
 */
export const CommandEnqueueSchema = z.object({
  type: z.literal("command.enqueue"),
  commandId: z.string().min(1),
  kind: BridgeCommandKindSchema,
  /** Target tab when multi-tab; omit to mean active paired tab. */
  tabId: z.string().min(1).optional(),
  /** mark_patch_* payload */
  patchId: z.string().min(1).optional(),
  description: z.string().optional(),
  /** mark_patch_completed payload */
  success: z.boolean().optional(),
  /** Optional changeset scope for clear/verify */
  changesetId: z.string().min(1).optional(),
});
export type CommandEnqueue = z.infer<typeof CommandEnqueueSchema>;

/** Extension → MCP: acknowledge a prior command.enqueue. */
export const CommandAckSchema = z.object({
  type: z.literal("command.ack"),
  commandId: z.string().min(1),
  ok: z.boolean(),
  reason: z.string().optional(),
  tabId: z.string().min(1).optional(),
});
export type CommandAck = z.infer<typeof CommandAckSchema>;

/**
 * Bridge catalog schemas (excluding session.heartbeat, which lives in the
 * browser→daemon catalog and is reused on the bridge wire).
 */
export const bridgeSchemas = [SnapshotPushSchema, CommandEnqueueSchema, CommandAckSchema] as const;
