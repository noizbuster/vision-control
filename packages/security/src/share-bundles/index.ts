/**
 * V2 local share bundles (ADR-015 / ADR-018): redacted, signed, audit-logged
 * export/import of a session. No network relay, no raw tokens, screenshots
 * excluded by default. See individual module docstrings for the contracts.
 */

export {
  type CreateShareBundleAuditEntryInput,
  createShareBundleAuditEntry,
  type ShareBundleAuditEntry,
  ShareBundleAuditEntrySchema,
  type ShareBundleAuditEvent,
  ShareBundleAuditEventSchema,
  type ShareBundleAuditOutcome,
  ShareBundleAuditOutcomeSchema,
  serializeAuditLog,
} from "./audit-log.js";
export {
  BUNDLE_FORMAT_VERSION,
  type BundleRedactionReport,
  BundleRedactionReportSchema,
  canonicalJson,
  computeBundleHash,
  containsForbiddenTokenFields,
  contentForHashing,
  FORBIDDEN_TOKEN_FIELDS,
  type ForbiddenTokenScan,
  HASH_PATTERN,
  type IntegrityResult,
  type ScreenshotMetadata,
  ScreenshotMetadataSchema,
  ScreenshotRedactionSummarySchema,
  type ShareBundle,
  ShareBundleSchema,
  type ShareBundleSignature,
  ShareBundleSignatureSchema,
  signLocal,
  verifyBundleIntegrity,
} from "./bundle-schema.js";
export { type ExportBundleInput, exportBundle } from "./export-bundle.js";
export {
  type ImportBundleOptions,
  type ImportError,
  type ImportResult,
  importBundle,
  type ReconstructedBundle,
} from "./import-bundle.js";
