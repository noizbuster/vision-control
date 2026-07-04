import { z } from "zod";

/**
 * PRD §25.2 — Daemon → Browser business messages (7 variants).
 *
 * Sent from the daemon to the browser panel after the transport handshake.
 * Workspace source paths are never exposed to the browser (PRD §27.1), so
 * `workspace.bound` carries only metadata, never a filesystem path.
 */

/** §25.2.1 — Daemon accepts the business-level session. */
export const SessionAcceptedSchema = z.object({
  type: z.literal("session.accepted"),
  sessionId: z.string().min(1),
  expiresAt: z.number().int().nonnegative().optional(),
});
export type SessionAccepted = z.infer<typeof SessionAcceptedSchema>;

/** §25.2.2 — Workspace bound to the session (path stays server-side). */
export const WorkspaceBoundSchema = z.object({
  type: z.literal("workspace.bound"),
  fileCount: z.number().int().nonnegative(),
  /**
   * Workspace Tailwind breakpoint scale (plan task 7). Populated daemon-side
   * from the resolved `theme.screens` and delivered to the content runtime so
   * it resolves the active breakpoint via `matchMedia` without importing the
   * node-only tailwind integration. Absent when no config is present (content
   * falls back to its hardcoded default scale).
   */
  screens: z.array(z.string().min(1)).readonly().optional(),
});
export type WorkspaceBound = z.infer<typeof WorkspaceBoundSchema>;

/** §25.2.3 — Source resolved for a prior source.request. */
export const SourceResolvedSchema = z.object({
  type: z.literal("source.resolved"),
  requestId: z.string().min(1),
  elementId: z.string().min(1),
  sourceToken: z.string().min(1),
  confidence: z.enum(["high", "medium", "low", "none"]),
});
export type SourceResolved = z.infer<typeof SourceResolvedSchema>;

/** §25.2.4 — Agent context compiled and ready. */
export const ContextCompiledSchema = z.object({
  type: z.literal("context.compiled"),
  contextId: z.string().min(1),
  tokenCount: z.number().int().nonnegative(),
  format: z.enum(["json", "markdown"]),
});
export type ContextCompiled = z.infer<typeof ContextCompiledSchema>;

/** §25.2.5 — Daemon requests the browser to run verification. */
export const VerificationRequestedSchema = z.object({
  type: z.literal("verification.requested"),
  changesetId: z.string().min(1),
  timeoutMs: z.number().int().positive(),
});
export type VerificationRequested = z.infer<typeof VerificationRequestedSchema>;

/** §25.2.6 — Daemon requests the browser to clear its preview layer. */
export const PreviewClearRequestedSchema = z.object({
  type: z.literal("preview.clearRequested"),
  changesetId: z.string().optional(),
  reason: z.string(),
});
export type PreviewClearRequested = z.infer<typeof PreviewClearRequestedSchema>;

/** §25.2.7 — Configuration updated (which config keys changed). */
export const ConfigurationUpdatedSchema = z.object({
  type: z.literal("configuration.updated"),
  keys: z.array(z.string()),
});
export type ConfigurationUpdated = z.infer<typeof ConfigurationUpdatedSchema>;

export const daemonToBrowserSchemas = [
  SessionAcceptedSchema,
  WorkspaceBoundSchema,
  SourceResolvedSchema,
  ContextCompiledSchema,
  VerificationRequestedSchema,
  PreviewClearRequestedSchema,
  ConfigurationUpdatedSchema,
] as const;
