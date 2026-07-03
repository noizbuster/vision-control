import { z } from "zod";

/**
 * PRD §25.1 — Browser → Daemon business messages (8 variants).
 *
 * These ride inside the protocol envelope `payload` after the transport-level
 * `hello`/`welcome` handshake completes. Each variant is discriminated by its
 * dotted `type` literal. Payloads that reference external package types
 * (change-ir operations, source tokens) stay `unknown` here so the protocol
 * package never imports from another package (boundary discipline).
 */

/** §25.1.1 — Post-handshake session announcement from the browser panel. */
export const SessionHelloSchema = z.object({
  type: z.literal("session.hello"),
  tabId: z.string().min(1),
});
export type SessionHello = z.infer<typeof SessionHelloSchema>;

/** §25.1.2 — Keepalive heartbeat. */
export const SessionHeartbeatSchema = z.object({
  type: z.literal("session.heartbeat"),
  clientTime: z.number().int().nonnegative(),
});
export type SessionHeartbeat = z.infer<typeof SessionHeartbeatSchema>;

/** §25.1.3 — Page navigation (replaces the generic page-event). */
export const PageNavigatedSchema = z.object({
  type: z.literal("page.navigated"),
  url: z.string(),
  title: z.string(),
  framePath: z.array(z.string()),
});
export type PageNavigated = z.infer<typeof PageNavigatedSchema>;

/** §25.1.4 — Element selection changed. */
export const SelectionChangedSchema = z.object({
  type: z.literal("selection.changed"),
  elementId: z.string().min(1),
  framePath: z.array(z.string()),
});
export type SelectionChanged = z.infer<typeof SelectionChangedSchema>;

/** §25.1.5 — Changeset updated (operations are opaque at the protocol layer). */
export const ChangesetUpdatedSchema = z.object({
  type: z.literal("changeset.updated"),
  changesetId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  operations: z.array(z.unknown()),
});
export type ChangesetUpdated = z.infer<typeof ChangesetUpdatedSchema>;

/** §25.1.6 — Request source resolution for an element. */
export const SourceRequestSchema = z.object({
  type: z.literal("source.request"),
  requestId: z.string().min(1),
  elementId: z.string().min(1),
});
export type SourceRequest = z.infer<typeof SourceRequestSchema>;

/** §25.1.7 — Runtime verification result reported by the browser. */
export const VerificationRuntimeResultSchema = z.object({
  type: z.literal("verification.runtimeResult"),
  changesetId: z.string().min(1),
  passed: z.boolean(),
  diff: z.unknown().optional(),
});
export type VerificationRuntimeResult = z.infer<typeof VerificationRuntimeResultSchema>;

/** §25.1.8 — Diagnostic reported from the browser. */
export const DiagnosticReportedSchema = z.object({
  type: z.literal("diagnostic.reported"),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  elementId: z.string().optional(),
});
export type DiagnosticReported = z.infer<typeof DiagnosticReportedSchema>;

export const browserToDaemonSchemas = [
  SessionHelloSchema,
  SessionHeartbeatSchema,
  PageNavigatedSchema,
  SelectionChangedSchema,
  ChangesetUpdatedSchema,
  SourceRequestSchema,
  VerificationRuntimeResultSchema,
  DiagnosticReportedSchema,
] as const;
