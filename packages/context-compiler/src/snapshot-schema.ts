/**
 * Portable {@link VisionContextSnapshot} schema (ADR-019 / ADR-020).
 *
 * Compiled from pure extension data: selection, change-IR operations, journal
 * summary, map origins, confidence, and redaction-report hooks. No workspace
 * root, no daemon, and no absolute machine paths are required. Origins may be
 * empty; `originsTruncated` records C4 map-cap skips; `snapshotRev` is monotonic
 * per tab for MCP projection freshness.
 */

import { z } from "zod";

import {
  OperationSummarySchema,
  PrivacyReportSchema,
  SourceConfidenceDetailSchema,
  SourceConfidenceLevelSchema,
  TargetSummarySchema,
  WarningSchema,
} from "./context-schema.js";

/** Format version for the portable extension snapshot document. */
export const SNAPSHOT_FORMAT_VERSIONS = ["1.0.0", "1.1.0"] as const;
export const SNAPSHOT_FORMAT_VERSION = "1.1.0" as const;

/**
 * One map-derived origin candidate. Paths are URL or map-relative only — never
 * a required absolute machine path (agents resolve files themselves).
 */
export const MapOriginSchema = z.object({
  /** Resource URL the origin was resolved from (stylesheet or script). */
  sourceUrl: z.string().optional(),
  /** Source-map URL when known. */
  mapUrl: z.string().optional(),
  /**
   * Path as reported by the map (`sources` entry), possibly after normalizing
   * webpack:// etc. Not a workspace-absolute filesystem path.
   */
  relativePath: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  startColumn: z.number().int().nonnegative().optional(),
  endLine: z.number().int().positive().optional(),
  endColumn: z.number().int().nonnegative().optional(),
  snippet: z.string().optional(),
  confidence: SourceConfidenceLevelSchema,
  kind: z.enum(["css", "js", "unknown"]).optional(),
  warnings: z.array(z.string()),
});
export type MapOrigin = z.infer<typeof MapOriginSchema>;

/**
 * Compact journal summary for export/MCP. Full journal entries (with DOM
 * snapshots) stay in the extension; this is the portable projection.
 */
export const JournalSummarySchema = z.object({
  entryCount: z.number().int().nonnegative(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  undoDepth: z.number().int().nonnegative(),
  redoDepth: z.number().int().nonnegative(),
  /** Recent operation kinds (most recent last); empty when journal is empty. */
  recentKinds: z.array(z.string()),
});
export type JournalSummary = z.infer<typeof JournalSummarySchema>;

/**
 * Portable Vision Control context snapshot. Source of truth lives in the
 * extension; MCP and panel export project this document. Field set matches
 * ADR-019: selection + changeset/IR + journal summary + map origins +
 * confidence + redaction report hooks.
 */
export const VisionContextSnapshotSchema = z.object({
  formatVersion: z.enum(SNAPSHOT_FORMAT_VERSIONS),
  /**
   * Monotonic revision per tab. MCP projection cache uses this for freshness
   * (ADR-020 command queue / snapshot push).
   */
  snapshotRev: z.number().int().nonnegative(),
  /** Opaque tab identifier when known (not a filesystem path). */
  tabId: z.string().optional(),
  /** Opaque session identifier when known. */
  sessionId: z.string().optional(),
  /** Epoch-ms compilation timestamp. */
  compiledAt: z.number().int().nonnegative(),
  /** JSON-safe selection projection; absent when nothing is selected. */
  selection: TargetSummarySchema.optional(),
  /** Optional changeset id when the IR is grouped. */
  changesetId: z.string().optional(),
  /** Change-IR operations reduced to agent-facing summaries. */
  operations: z.array(OperationSummarySchema),
  /** Compact undo/redo journal projection. */
  journal: JournalSummarySchema,
  /**
   * Map-derived origins. Empty array is valid (ADR-019: origins may be empty).
   */
  origins: z.array(MapOriginSchema),
  /**
   * True when C4 map caps caused remaining maps to be skipped (ADR-019 C4).
   */
  originsTruncated: z.boolean(),
  /** Overall source-mapping confidence when known. */
  confidence: SourceConfidenceLevelSchema.optional(),
  /** Detail behind the confidence level when known. */
  sourceConfidenceDetail: SourceConfidenceDetailSchema.optional(),
  /**
   * Redaction report from the ADR-009 pass applied on every snapshot build.
   * Always present (may be empty when nothing matched). Never carries secret
   * values — only field paths, rule ids, and reasons.
   */
  privacyReport: PrivacyReportSchema,
  warnings: z.array(WarningSchema),
});
export type VisionContextSnapshot = z.infer<typeof VisionContextSnapshotSchema>;

/** Empty journal summary used when the caller supplies no journal data. */
export const EMPTY_JOURNAL_SUMMARY: JournalSummary = {
  entryCount: 0,
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
  recentKinds: [],
};

/** Empty privacy report hook for snapshots that have not been redacted yet. */
export const EMPTY_PRIVACY_REPORT = {
  redactions: [] as const,
  totalRedacted: 0,
} as const;
