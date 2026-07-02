/**
 * Audit event schema.
 *
 * Security-relevant daemon events are recorded as append-only audit rows (PRD
 * §30, `docs/agents/security-privacy.md#audit-logging`). The `AuditRepository`
 * in `packages/storage` exposes no `update`/`delete` — events are immutable.
 */

import { z } from "zod";

export const AuditEventTypeSchema = z.enum([
  "auth",
  "config",
  "session",
  "source",
  "changeset",
  "verification",
  "export",
]);

export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventOutcomeSchema = z.enum(["success", "failure"]);

export type AuditEventOutcome = z.infer<typeof AuditEventOutcomeSchema>;

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  type: AuditEventTypeSchema,
  action: z.string().min(1),
  actor: z.string().min(1),
  target: z.string().optional(),
  outcome: AuditEventOutcomeSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export interface CreateAuditEventInput {
  readonly type: AuditEventType;
  readonly action: string;
  readonly actor: string;
  readonly outcome: AuditEventOutcome;
  readonly target?: string;
  readonly metadata?: Record<string, unknown>;
  /** Injectable id generator (defaults to `crypto.randomUUID()`). */
  readonly id?: string;
  /** Injectable clock (defaults to `Date.now()`). */
  readonly timestamp?: number;
}

/**
 * Construct a validated {@link AuditEvent}, filling `id` and `timestamp` from
 * injectable defaults. Fields carrying secret-shaped values should be redacted
 * by the caller before they reach `metadata`.
 */
export const createAuditEvent = (input: CreateAuditEventInput): AuditEvent =>
  AuditEventSchema.parse({
    id: input.id ?? globalThis.crypto.randomUUID(),
    timestamp: input.timestamp ?? Date.now(),
    type: input.type,
    action: input.action,
    actor: input.actor,
    ...(input.target !== undefined ? { target: input.target } : {}),
    outcome: input.outcome,
    metadata: input.metadata ?? {},
  });
