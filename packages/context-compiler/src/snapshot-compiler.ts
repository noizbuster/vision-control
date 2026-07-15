/**
 * Pure-data compiler for {@link VisionContextSnapshot}.
 *
 * Inputs are already JSON-safe projections (selection target, operation
 * summaries, journal summary, map origins). No workspace root, no filesystem,
 * and no platform:node APIs. Empty origins are valid.
 *
 * Every build runs through {@link redactVisionContextSnapshot} (ADR-009) so
 * panel export and MCP projection never receive unredacted secrets.
 */

import type {
  OperationSummary,
  PrivacyReport,
  SourceConfidenceDetail,
  SourceConfidenceLevel,
  TargetSummary,
  Warning,
} from "./context-schema.js";
import { redactVisionContextSnapshot } from "./redaction.js";
import type { RedactionConfig } from "./redaction-selectors.js";
import {
  EMPTY_JOURNAL_SUMMARY,
  EMPTY_PRIVACY_REPORT,
  type JournalSummary,
  type MapOrigin,
  SNAPSHOT_FORMAT_VERSION,
  type VisionContextSnapshot,
} from "./snapshot-schema.js";

/** Inputs to {@link compileVisionContextSnapshot}. All fields are pure data. */
export interface CompileSnapshotInputs {
  /**
   * Monotonic revision for this tab. Caller owns incrementing; the compiler
   * never invents or resets it.
   */
  readonly snapshotRev: number;
  /** Opaque tab id when known. */
  readonly tabId?: string;
  /** Opaque session id when known. */
  readonly sessionId?: string;
  /** Epoch-ms compilation timestamp (default `Date.now()`). */
  readonly compiledAt?: number;
  /** JSON-safe selection projection; omit when nothing is selected. */
  readonly selection?: TargetSummary;
  /** Optional changeset id. */
  readonly changesetId?: string;
  /** Change-IR operation summaries (default empty). */
  readonly operations?: readonly OperationSummary[];
  /** Journal summary (default empty journal). */
  readonly journal?: JournalSummary;
  /**
   * Map-derived origins. Default empty array — valid per ADR-019.
   */
  readonly origins?: readonly MapOrigin[];
  /**
   * Whether C4 caps truncated origin collection. Default `false`.
   */
  readonly originsTruncated?: boolean;
  /** Overall source-mapping confidence when known. */
  readonly confidence?: SourceConfidenceLevel;
  /** Detail behind the confidence level when known. */
  readonly sourceConfidenceDetail?: SourceConfidenceDetail;
  /**
   * Pre-existing privacy report entries to merge (e.g. upstream selector
   * findings). Default empty; the compile path always runs ADR-009 redaction
   * and rebuilds the report.
   */
  readonly privacyReport?: PrivacyReport;
  /** Warnings collected from any source (default empty). */
  readonly warnings?: readonly Warning[];
  /** Optional DOM/selector redaction config (PRD §27.2). */
  readonly redactionConfig?: RedactionConfig;
}

/**
 * Compile a portable {@link VisionContextSnapshot} from pure data.
 *
 * Does not accept or require `workspaceRoot`. Absolute machine paths are not
 * part of the input contract. Empty `origins` is valid and produces a schema-
 * valid snapshot with `origins: []` and `originsTruncated: false` (unless the
 * caller sets the truncation flag).
 *
 * Always applies ADR-009 redaction before return — there is no unredacted
 * product path from this compiler.
 */
export const compileVisionContextSnapshot = (
  inputs: CompileSnapshotInputs,
): VisionContextSnapshot => {
  const origins = inputs.origins !== undefined ? [...inputs.origins] : [];
  const operations = inputs.operations !== undefined ? [...inputs.operations] : [];
  const warnings = inputs.warnings !== undefined ? [...inputs.warnings] : [];
  const journal = inputs.journal ?? EMPTY_JOURNAL_SUMMARY;
  const privacyReport = inputs.privacyReport ?? {
    redactions: [...EMPTY_PRIVACY_REPORT.redactions],
    totalRedacted: EMPTY_PRIVACY_REPORT.totalRedacted,
  };

  const raw: VisionContextSnapshot = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    snapshotRev: inputs.snapshotRev,
    ...(inputs.tabId !== undefined ? { tabId: inputs.tabId } : {}),
    ...(inputs.sessionId !== undefined ? { sessionId: inputs.sessionId } : {}),
    compiledAt: inputs.compiledAt ?? Date.now(),
    ...(inputs.selection !== undefined ? { selection: inputs.selection } : {}),
    ...(inputs.changesetId !== undefined ? { changesetId: inputs.changesetId } : {}),
    operations,
    journal: {
      entryCount: journal.entryCount,
      canUndo: journal.canUndo,
      canRedo: journal.canRedo,
      undoDepth: journal.undoDepth,
      redoDepth: journal.redoDepth,
      recentKinds: [...journal.recentKinds],
    },
    origins: origins.map(cloneOrigin),
    originsTruncated: inputs.originsTruncated ?? false,
    ...(inputs.confidence !== undefined ? { confidence: inputs.confidence } : {}),
    ...(inputs.sourceConfidenceDetail !== undefined
      ? {
          sourceConfidenceDetail: {
            method: inputs.sourceConfidenceDetail.method,
            reasons: [...inputs.sourceConfidenceDetail.reasons],
            warnings: [...inputs.sourceConfidenceDetail.warnings],
          },
        }
      : {}),
    privacyReport: {
      redactions: privacyReport.redactions.map((entry) => ({ ...entry })),
      totalRedacted: privacyReport.totalRedacted,
    },
    warnings: warnings.map((warning) => ({ ...warning })),
  };

  return redactVisionContextSnapshot(raw, inputs.redactionConfig);
};

const cloneOrigin = (origin: MapOrigin): MapOrigin => ({
  ...(origin.sourceUrl !== undefined ? { sourceUrl: origin.sourceUrl } : {}),
  ...(origin.mapUrl !== undefined ? { mapUrl: origin.mapUrl } : {}),
  ...(origin.relativePath !== undefined ? { relativePath: origin.relativePath } : {}),
  ...(origin.startLine !== undefined ? { startLine: origin.startLine } : {}),
  ...(origin.startColumn !== undefined ? { startColumn: origin.startColumn } : {}),
  ...(origin.endLine !== undefined ? { endLine: origin.endLine } : {}),
  ...(origin.endColumn !== undefined ? { endColumn: origin.endColumn } : {}),
  ...(origin.snippet !== undefined ? { snippet: origin.snippet } : {}),
  confidence: origin.confidence,
  ...(origin.kind !== undefined ? { kind: origin.kind } : {}),
  warnings: [...origin.warnings],
});
