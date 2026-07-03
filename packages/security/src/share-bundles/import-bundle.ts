/**
 * Import a share bundle into a fresh local session (ADR-015 / ADR-018).
 *
 * The import pipeline validates, then verifies, then rejects-or-accepts:
 * 1. Schema-validate the raw bundle (`ShareBundleSchema`).
 * 2. Recompute the content hash and reject tampered/corrupted bundles.
 * 3. Reject any bundle carrying a raw (unmasked) forbidden token field.
 * 4. Reject any bundle carrying raw image bytes (data-URL screenshots).
 * 5. Reject expired bundles (stale-state defense).
 * On success, reconstruct the redacted ChangeSet/context and return an import
 * audit entry. There is no network relay — import reads a local file only.
 */

import { createShareBundleAuditEntry, type ShareBundleAuditEntry } from "./audit-log.js";
import {
  containsForbiddenTokenFields,
  type ShareBundle,
  ShareBundleSchema,
  verifyBundleIntegrity,
} from "./bundle-schema.js";

export type ImportError =
  | { readonly kind: "schema"; readonly message: string; readonly issues: unknown }
  | { readonly kind: "tamper"; readonly message: string }
  | { readonly kind: "forbidden-token"; readonly message: string; readonly field: string }
  | { readonly kind: "screenshot-leak"; readonly message: string }
  | { readonly kind: "expired"; readonly message: string };

export interface ReconstructedBundle {
  readonly changeset: unknown;
  readonly context: unknown;
}

export type ImportResult =
  | {
      readonly ok: true;
      readonly bundle: ShareBundle;
      readonly reconstructed: ReconstructedBundle;
      readonly auditEntry: ShareBundleAuditEntry;
    }
  | { readonly ok: false; readonly error: ImportError };

export interface ImportBundleOptions {
  readonly actor?: string;
  readonly now?: number;
  readonly auditId?: string;
  /** Reject bundles whose `expiresAt` has passed (default true). */
  readonly enforceExpiry?: boolean;
}

const DATA_URL_IMAGE_RE = /^data:image\//i;

/** Find any string value (anywhere in `content`) that looks like a raw image data URL. */
const findImageDataUrl = (content: unknown): string | undefined => {
  const seen = new WeakSet<object>();
  const scan = (value: unknown, path: string): string | undefined => {
    if (typeof value === "string") {
      return DATA_URL_IMAGE_RE.test(value) ? path : undefined;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) return undefined;
      seen.add(value);
      for (let i = 0; i < value.length; i += 1) {
        const hit = scan(value[i], `${path}[${i}]`);
        if (hit !== undefined) return hit;
      }
      return undefined;
    }
    if (value !== null && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (seen.has(object)) return undefined;
      seen.add(object);
      for (const key of Object.keys(object)) {
        const hit = scan(object[key], path === "<root>" ? key : `${path}.${key}`);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  return scan(content, "<root>");
};

/**
 * Import and verify a share bundle. `raw` may be a parsed object or a JSON
 * string. Never throws: every failure path returns `{ ok: false, error }`.
 */
export const importBundle = async (
  raw: unknown,
  options: ImportBundleOptions = {},
): Promise<ImportResult> => {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: "schema",
          message: "bundle is not valid JSON",
          issues: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  const schemaResult = ShareBundleSchema.safeParse(parsed);
  if (!schemaResult.success) {
    return {
      ok: false,
      error: {
        kind: "schema",
        message: "bundle failed schema validation",
        issues: schemaResult.error.issues,
      },
    };
  }
  const bundle = schemaResult.data;

  const integrity = await verifyBundleIntegrity(bundle);
  if (!integrity.ok) {
    return { ok: false, error: { kind: "tamper", message: integrity.message } };
  }

  const tokenScan = containsForbiddenTokenFields(bundle);
  if (tokenScan.found) {
    return {
      ok: false,
      error: {
        kind: "forbidden-token",
        message: `bundle contains a forbidden token field carrying a raw value: ${tokenScan.field}`,
        field: tokenScan.field ?? "<unknown>",
      },
    };
  }

  const leak = findImageDataUrl(bundle);
  if (leak !== undefined) {
    return {
      ok: false,
      error: {
        kind: "screenshot-leak",
        message: `bundle contains raw image bytes (data URL) at ${leak}`,
      },
    };
  }

  if ((options.enforceExpiry ?? true) && bundle.expiresAt !== undefined) {
    const now = options.now ?? Date.now();
    if (bundle.expiresAt <= now) {
      return {
        ok: false,
        error: { kind: "expired", message: `bundle expired at ${bundle.expiresAt} (now ${now})` },
      };
    }
  }

  const auditEntry = createShareBundleAuditEntry({
    event: "import",
    actor: options.actor ?? "vision-control:share-import",
    outcome: "success",
    bundleHash: bundle.hash,
    ...(options.now !== undefined ? { timestamp: options.now } : {}),
    ...(options.auditId !== undefined ? { id: options.auditId } : {}),
  });

  return {
    ok: true,
    bundle,
    reconstructed: { changeset: bundle.changeset, context: bundle.context },
    auditEntry,
  };
};
