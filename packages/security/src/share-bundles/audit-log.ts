/**
 * Append-only audit log for share-bundle export/import events (ADR-015).
 *
 * Every share bundle carries an audit log of the export event that produced it
 * and every import event that consumed it. The log travels WITH the bundle so a
 * reviewer can reconstruct its provenance without a central service. Entries are
 * append-only; there is no mutation or deletion path (mirrors the daemon
 * `AuditRepository` immutability contract from `packages/storage`).
 */

import { z } from "zod";

export const ShareBundleAuditEventSchema = z.enum(["export", "import"]);
export type ShareBundleAuditEvent = z.infer<typeof ShareBundleAuditEventSchema>;

export const ShareBundleAuditOutcomeSchema = z.enum(["success", "failure"]);
export type ShareBundleAuditOutcome = z.infer<typeof ShareBundleAuditOutcomeSchema>;

/**
 * One entry in a share bundle's audit log. `bundleHash` ties the entry to a
 * specific bundle instance (its content hash); `actor` is who exported/imported
 * (e.g. `cli:vision-control` or a session id). `note` carries a short human
 * reason (e.g. the import rejection reason for a `failure` outcome).
 */
export const ShareBundleAuditEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  event: ShareBundleAuditEventSchema,
  actor: z.string().min(1),
  outcome: ShareBundleAuditOutcomeSchema,
  note: z.string().optional(),
  bundleHash: z.string().optional(),
});

export type ShareBundleAuditEntry = z.infer<typeof ShareBundleAuditEntrySchema>;

export interface CreateShareBundleAuditEntryInput {
  readonly event: ShareBundleAuditEvent;
  readonly actor: string;
  readonly outcome: ShareBundleAuditOutcome;
  readonly note?: string;
  readonly bundleHash?: string;
  /** Injectable id (defaults to `crypto.randomUUID()`). */
  readonly id?: string;
  /** Injectable clock (defaults to `Date.now()`). */
  readonly timestamp?: number;
}

/**
 * Construct a validated audit entry, filling `id` and `timestamp` from
 * injectable defaults (deterministic in tests). Never carries a secret value;
 * the bundle hash is a digest, not a credential.
 */
export const createShareBundleAuditEntry = (
  input: CreateShareBundleAuditEntryInput,
): ShareBundleAuditEntry =>
  ShareBundleAuditEntrySchema.parse({
    id: input.id ?? globalThis.crypto.randomUUID(),
    timestamp: input.timestamp ?? Date.now(),
    event: input.event,
    actor: input.actor,
    outcome: input.outcome,
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.bundleHash !== undefined ? { bundleHash: input.bundleHash } : {}),
  });

/**
 * Render an audit log as a human-readable multi-line string (one entry per
 * line). Used by the CLI `share import` command to surface provenance. The
 * rendering is for display only; the canonical log is the JSON array in the
 * bundle.
 */
export const serializeAuditLog = (entries: readonly ShareBundleAuditEntry[]): string =>
  entries
    .map(
      (entry) =>
        `[${entry.timestamp}] ${entry.event} ${entry.outcome}` +
        ` actor=${entry.actor}` +
        (entry.bundleHash !== undefined ? ` hash=${entry.bundleHash.slice(0, 12)}…` : "") +
        (entry.note !== undefined ? ` note=${entry.note}` : ""),
    )
    .join("\n");
