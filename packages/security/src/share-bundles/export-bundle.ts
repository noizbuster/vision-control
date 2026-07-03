/**
 * Export a redacted, signed share bundle from a session (ADR-015 / ADR-018).
 *
 * The export pipeline: deep-redact the raw ChangeSet and compiled context with
 * the ADR-009 deny-by-default layer, mask screenshots entirely unless the
 * caller explicitly opts in (ADR-011), build a redaction report, append an
 * export audit entry, then hash + sign the content. The result is a JSON-safe
 * {@link ShareBundle} the caller writes to a local file. There is no network
 * relay — the bundle is the out-of-band sharing unit.
 */

import { createPrivacyReport, redactObject } from "../redaction.js";
import { createShareBundleAuditEntry, type ShareBundleAuditEntry } from "./audit-log.js";
import {
  BUNDLE_FORMAT_VERSION,
  computeBundleHash,
  type ScreenshotMetadata,
  type ShareBundle,
} from "./bundle-schema.js";

export interface ExportBundleInput {
  readonly workspaceId: string;
  readonly sessionId: string;
  /** Raw ChangeSet object. Deep-redacted; the input is never mutated. */
  readonly changeset: unknown;
  /** Raw compiled context object. Deep-redacted; the input is never mutated. */
  readonly context: unknown;
  /** Default false: screenshots excluded entirely (ADR-011). */
  readonly includeScreenshots?: boolean;
  /** Used only when `includeScreenshots` is true. */
  readonly screenshotMetadata?: ScreenshotMetadata;
  /** Optional bundle expiry (ms epoch). */
  readonly expiresAt?: number;
  /** Prior audit entries carried into the new bundle (e.g. on re-export). */
  readonly priorAuditLog?: readonly ShareBundleAuditEntry[];
  /** Actor recorded in the export audit entry. */
  readonly actor?: string;
  /** Injectable clock for deterministic tests. */
  readonly now?: number;
  /** Injectable audit-entry id for deterministic tests. */
  readonly auditId?: string;
}

/**
 * Keys stripped from the redacted context when screenshots are NOT explicitly
 * included (ADR-011 default). Covers the context-compiler `screenshotRef`
 * metadata field plus any image/blob-shaped key as defense in depth. Stripping
 * happens AFTER redaction, on the fresh redacted tree (the input is untouched).
 */
const SCREENSHOT_KEY_RE =
  /^(screenshot(ref|metadata|data|blob)?|image|picture|snapshotdata|blob)$/i;

const stripScreenshotFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripScreenshotFields);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
      if (SCREENSHOT_KEY_RE.test(key)) continue;
      out[key] = stripScreenshotFields(child);
    }
    return out;
  }
  return value;
};

/**
 * Produce a signed {@link ShareBundle} from a session's ChangeSet and context.
 * Applies ADR-009 redaction, ADR-011 screenshot opt-in, and appends an export
 * audit entry. The returned bundle is JSON-safe and ready to write to a local
 * file. Never throws on valid input; the redaction layer is total.
 */
export const exportBundle = async (input: ExportBundleInput): Promise<ShareBundle> => {
  const includeScreenshots = input.includeScreenshots === true;
  const now = input.now ?? Date.now();

  // Redact the combined tree once; redactObject is deep and returns a fresh tree.
  const raw = { changeset: input.changeset, context: input.context };
  const redacted = redactObject(raw) as { changeset: unknown; context: unknown };
  const redactionReport = createPrivacyReport(raw, redacted);

  let context = redacted.context;
  if (!includeScreenshots) {
    context = stripScreenshotFields(context);
  }

  const exportEntry = createShareBundleAuditEntry({
    event: "export",
    actor: input.actor ?? "vision-control:share-export",
    outcome: "success",
    timestamp: now,
    ...(input.auditId !== undefined ? { id: input.auditId } : {}),
  });
  const auditLog: ShareBundleAuditEntry[] = [...(input.priorAuditLog ?? []), exportEntry];

  const unsignedContent: Record<string, unknown> = {
    version: BUNDLE_FORMAT_VERSION,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    changeset: redacted.changeset,
    context,
    auditLog,
    redactionReport,
    createdAt: now,
  };
  if (includeScreenshots && input.screenshotMetadata !== undefined) {
    unsignedContent.screenshotMetadata = input.screenshotMetadata;
  }
  if (input.expiresAt !== undefined) {
    unsignedContent.expiresAt = input.expiresAt;
  }

  const hash = await computeBundleHash(unsignedContent);
  return {
    ...(unsignedContent as Omit<ShareBundle, "signature" | "hash">),
    signature: { algorithm: "sha256-local-v2", value: hash },
    hash,
  };
};
