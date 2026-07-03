/**
 * Bundle schema, integrity primitives, and the forbidden-token guard for V2
 * local share bundles (ADR-015 / ADR-018).
 *
 * A share bundle is a redacted, signed, audit-logged artifact that carries the
 * ChangeSet and compiled context of a session so it can be imported into a fresh
 * local session out of band. It is the ONLY collaboration surface in V2 (ADR-015
 * + ADR-018): no network relay, no cloud sync, no remote session join.
 *
 * This module owns:
 * - The {@link ShareBundleSchema} Zod contract (the wire shape).
 * - The integrity math: {@link computeBundleHash} (SHA-256 over canonical JSON),
 *   {@link signLocal}, and {@link verifyBundleIntegrity} (tamper detection).
 * - The {@link containsForbiddenTokenFields} structural guard that rejects any
 *   bundle carrying a raw daemon/MCP/session token, bearer, authorization,
 *   cookie, or password field. The redaction layer masks secret *values*; this
 *   guard rejects secret-shaped *keys* outright.
 *
 * The `changeset` and `context` fields are opaque (`z.unknown()`): they have
 * already passed through `redactObject` at export time. This keeps the security
 * package free of any dependency on change-ir/context-compiler (the bundle is a
 * transport format, not a re-validated domain model).
 */

import { z } from "zod";
import { REDACTED_MARKER } from "../redaction-patterns.js";
import { ShareBundleAuditEntrySchema } from "./audit-log.js";

/** Version of the share-bundle format. Additive minor bumps only. */
export const BUNDLE_FORMAT_VERSION = "1.0.0";

/** SHA-256 hex digest regex (64 lowercase hex chars). */
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Signature over the bundle content. For V2 local bundles the signature
 * algorithm is `sha256-local-v2`: the signature value equals the content hash
 * (tamper detection via a portable, self-contained hash — no shared secret is
 * required to hand a bundle out of band). Remote asymmetric signing (identity,
 * trust, revocation) is deferred until a trust-model ADR is approved (ADR-018).
 */
export const ShareBundleSignatureSchema = z.object({
  algorithm: z.literal("sha256-local-v2"),
  value: z.string().regex(HASH_PATTERN, "signature value must be a SHA-256 hex digest"),
});

export type ShareBundleSignature = z.infer<typeof ShareBundleSignatureSchema>;

/**
 * Post-capture redaction summary for an opt-in screenshot crop (mirrors the
 * context-compiler `ScreenshotRedactionSummary` so the bundle does not import
 * from context-compiler). `postCaptureRecheck === "fail"` crops are never
 * persisted (ADR-011).
 */
export const ScreenshotRedactionSummarySchema = z.object({
  totalMasked: z.number().int().nonnegative(),
  postCaptureRecheck: z.enum(["pass", "fail"]),
});

/**
 * Screenshot metadata, present ONLY when the caller explicitly opted into
 * screenshot inclusion (ADR-011). This is a CLOSED (`.strict()`) schema: it
 * carries an artifact id plus a redaction report/summary plus a retention
 * expiry. It NEVER carries image bytes, base64 blobs, or raw pixel data — any
 * extra field (e.g. `imageBytes`) fails schema validation at import. Absent by
 * default.
 */
export const ScreenshotMetadataSchema = z
  .object({
    artifactId: z.string().min(1),
    redactionReport: z.string().optional(),
    redactionSummary: ScreenshotRedactionSummarySchema.optional(),
    retentionExpiresAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ScreenshotMetadata = z.infer<typeof ScreenshotMetadataSchema>;

/**
 * Redaction report carried with the bundle so the importer can see what was
 * masked without re-exposing values. Mirrors `@vision-control/security`'s
 * `PrivacyReport` (defined locally to avoid a Zod/type split).
 */
export const BundleRedactionReportSchema = z.object({
  redactions: z.array(
    z.object({
      field: z.string(),
      patternId: z.string(),
      description: z.string(),
    }),
  ),
  totalRedacted: z.number().int().nonnegative(),
});

export type BundleRedactionReport = z.infer<typeof BundleRedactionReportSchema>;

/**
 * The full share bundle. `changeset` and `context` are opaque, already-redacted
 * content. There is intentionally no `daemonToken`/`mcpToken`/`sessionToken`/
 * `bearer`/`authorization`/`cookie`/`password` field; the
 * {@link containsForbiddenTokenFields} guard enforces that invariant at import.
 */
export const ShareBundleSchema = z.object({
  version: z.literal(BUNDLE_FORMAT_VERSION),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  changeset: z.unknown(),
  context: z.unknown(),
  screenshotMetadata: ScreenshotMetadataSchema.optional(),
  signature: ShareBundleSignatureSchema,
  hash: z.string().regex(HASH_PATTERN, "hash must be a SHA-256 hex digest"),
  auditLog: z.array(ShareBundleAuditEntrySchema),
  redactionReport: BundleRedactionReportSchema,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative().optional(),
});

export type ShareBundle = z.infer<typeof ShareBundleSchema>;

/**
 * Key names whose PRESENCE in a bundle is forbidden regardless of value. The
 * redaction layer masks secret values, but a bundle that even *contains* a key
 * shaped like a raw daemon/MCP/session token is rejected outright on import —
 * defense in depth against a malformed or hostile bundle (ADR-015).
 */
export const FORBIDDEN_TOKEN_FIELDS = [
  "daemonToken",
  "mcpToken",
  "sessionToken",
  "bearer",
  "authorization",
  "cookie",
  "password",
  "apiKey",
  "apiSecret",
  "secret",
  "token",
  "privateKey",
  "accessToken",
  "refreshToken",
  "authToken",
] as const;

const FORBIDDEN_KEY_SET = new Set(FORBIDDEN_TOKEN_FIELDS.map((field) => field.toLowerCase()));

/** Result of the forbidden-token structural scan. */
export interface ForbiddenTokenScan {
  readonly found: boolean;
  /** Dot-path of the first forbidden key encountered, e.g. `changeset.nested.token`. */
  readonly field?: string;
}

const NOT_FOUND: ForbiddenTokenScan = { found: false };

/**
 * Recursively scan `content` for any key whose name (case-insensitive) is a
 * forbidden token field CARRYING A RAW (unmasked) value. The redaction layer
 * masks secret values but keeps key names, so a legitimately-redacted
 * `{ password: "[REDACTED:sensitive-key:password]" }` PASSES — its value is a
 * redaction marker. A raw `{ sessionToken: "eyJ..." }` FAILS — a forbidden key
 * with a non-redacted value is rejected outright (defense in depth, ADR-015).
 *
 * Handles arrays and circular references. The scan inspects KEY NAMES and their
 * immediate value; redaction-report `patternId` values like `"password"` are
 * VALUES (never keys), so they do not trip this guard.
 */
export const containsForbiddenTokenFields = (content: unknown): ForbiddenTokenScan => {
  const seen = new WeakSet<object>();
  const scan = (value: unknown, path: string): ForbiddenTokenScan => {
    if (Array.isArray(value)) {
      if (seen.has(value)) return NOT_FOUND;
      seen.add(value);
      for (let i = 0; i < value.length; i += 1) {
        const child = value[i];
        if (child !== undefined) {
          const result = scan(child, `${path}[${i}]`);
          if (result.found) return result;
        }
      }
      return NOT_FOUND;
    }
    if (value !== null && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (seen.has(object)) return NOT_FOUND;
      seen.add(object);
      for (const key of Object.keys(object)) {
        if (FORBIDDEN_KEY_SET.has(key.toLowerCase())) {
          const fieldValue = object[key];
          // A masked value passes (the redaction layer already scrubbed it).
          if (typeof fieldValue === "string" && fieldValue.includes(REDACTED_MARKER)) {
            continue;
          }
          return { found: true, field: path === "<root>" ? key : `${path}.${key}` };
        }
        const child = object[key];
        if (child !== undefined) {
          const result = scan(child, path === "<root>" ? key : `${path}.${key}`);
          if (result.found) return result;
        }
      }
    }
    return NOT_FOUND;
  };
  return scan(content, "<root>");
};

/**
 * Produce a stable, key-sorted canonical JSON string of `value`. Object keys are
 * sorted at every depth so two structurally-equal objects hash identically
 * regardless of insertion order. This is the canonicalization input to
 * {@link computeBundleHash}.
 */
export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = canonicalize(source[key]);
    return sorted;
  }
  return value;
};

const HEX_DIGITS = "0123456789abcdef";

const hexFromBytes = (bytes: Uint8Array): string => {
  let out = "";
  for (const byte of bytes) {
    out += HEX_DIGITS[(byte >> 4) & 0x0f];
    out += HEX_DIGITS[byte & 0x0f];
  }
  return out;
};

const encoder = new TextEncoder();

/**
 * Compute the SHA-256 hex digest of `content` over its canonical JSON form.
 * Uses the Web Crypto `subtle.digest` API, available in Node 22+ and browsers,
 * so this module stays platform-isomorphic with no native dependency.
 */
export const computeBundleHash = async (content: unknown): Promise<string> => {
  const data = encoder.encode(canonicalJson(content));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return hexFromBytes(new Uint8Array(digest));
};

/**
 * The bundle content that is actually signed/hashed: every field EXCEPT
 * `signature` and `hash` (which are derived from the content). Stripping them
 * before hashing is what makes the integrity check meaningful — a tamperer who
 * changes a content field breaks the recomputed hash even if they also edit the
 * stored `hash` field, because import recomputes from the content.
 */
export const contentForHashing = (bundle: ShareBundle): Record<string, unknown> => {
  const { hash: _hash, signature: _signature, ...rest } = bundle;
  void _hash;
  void _signature;
  return rest;
};

/**
 * Sign `content` with the V2 local algorithm: the signature value IS the
 * content hash. Portable (no shared secret), so a bundle can be handed out of
 * band and imported anywhere. Remote asymmetric signing is deferred (ADR-018).
 */
export const signLocal = async (content: unknown): Promise<ShareBundleSignature> => ({
  algorithm: "sha256-local-v2",
  value: await computeBundleHash(content),
});

export type IntegrityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "tamper"; readonly message: string };

/**
 * Verify a bundle's integrity by recomputing the content hash and comparing it
 * to both the stored `hash` and the `signature.value` (which must agree for the
 * `sha256-local-v2` algorithm). A mismatch means the content was tampered with
 * after signing; import rejects it.
 */
export const verifyBundleIntegrity = async (bundle: ShareBundle): Promise<IntegrityResult> => {
  const recomputed = await computeBundleHash(contentForHashing(bundle));
  if (recomputed !== bundle.hash) {
    return {
      ok: false,
      reason: "tamper",
      message: "bundle content hash does not match the stored hash (tampered or corrupted)",
    };
  }
  if (bundle.signature.algorithm === "sha256-local-v2" && recomputed !== bundle.signature.value) {
    return {
      ok: false,
      reason: "tamper",
      message: "bundle signature does not match the content hash (tampered signature)",
    };
  }
  return { ok: true };
};
