/**
 * Markdown renderer for a portable {@link VisionContextSnapshot}.
 *
 * Human-readable export for panel copy/download. Callers MUST pass a snapshot
 * already produced by {@link compileVisionContextSnapshot} (always redacted).
 */

import type { OperationSummary, Warning } from "../context-schema.js";
import type { MapOrigin, VisionContextSnapshot } from "../snapshot-schema.js";

export const renderSnapshotMarkdown = (snapshot: VisionContextSnapshot): string => {
  const lines: string[] = [];
  lines.push("# Vision Context Snapshot", "");
  lines.push(`- **Format version:** ${snapshot.formatVersion}`);
  lines.push(`- **Snapshot rev:** ${snapshot.snapshotRev}`);
  lines.push(`- **Compiled at:** ${new Date(snapshot.compiledAt).toISOString()}`);
  if (snapshot.tabId !== undefined) lines.push(`- **Tab ID:** \`${snapshot.tabId}\``);
  if (snapshot.sessionId !== undefined) lines.push(`- **Session ID:** \`${snapshot.sessionId}\``);
  if (snapshot.changesetId !== undefined) {
    lines.push(`- **Changeset ID:** \`${snapshot.changesetId}\``);
  }
  if (snapshot.confidence !== undefined) lines.push(`- **Confidence:** ${snapshot.confidence}`);

  renderSelection(snapshot, lines);
  renderOperations(snapshot, lines);
  renderJournal(snapshot, lines);
  renderOrigins(snapshot, lines);
  renderSourceConfidenceDetail(snapshot, lines);
  renderWarnings(snapshot, lines);
  renderPrivacyReport(snapshot, lines);

  return lines.join("\n");
};

const heading = (lines: string[], text: string): void => {
  lines.push("", `## ${text}`, "");
};

const renderSelection = (snapshot: VisionContextSnapshot, lines: string[]): void => {
  heading(lines, "Selection");
  const selection = snapshot.selection;
  if (selection === undefined) {
    lines.push("_No element selected._");
    return;
  }
  const { identity, semantic, boxModel } = selection;
  lines.push(`- **Tag:** ${semantic.tagName}`);
  if (semantic.role !== undefined) lines.push(`- **Role:** ${semantic.role}`);
  if (semantic.name !== undefined) lines.push(`- **Name:** ${semantic.name}`);
  if (semantic.textContentPreview.length > 0) {
    lines.push(`- **Text:** ${truncate(semantic.textContentPreview, 100)}`);
  }
  if (identity.sourceId !== undefined) lines.push(`- **Source ID:** \`${identity.sourceId}\``);
  if (identity.runtimeId !== undefined) lines.push(`- **Runtime ID:** \`${identity.runtimeId}\``);
  if (identity.fingerprint !== undefined) {
    lines.push(`- **Fingerprint:** \`${identity.fingerprint}\``);
  }
  if (identity.confidence !== undefined) {
    lines.push(`- **Identity confidence:** ${identity.confidence}`);
  }
  if (identity.selectors.length > 0) {
    lines.push(`- **Selectors:** ${identity.selectors.map((s) => `\`${s}\``).join(", ")}`);
  }
  lines.push(
    `- **Box:** ${boxModel.contentWidth}×${boxModel.contentHeight} at (${boxModel.positionX}, ${boxModel.positionY})`,
  );
};

const renderOperations = (snapshot: VisionContextSnapshot, lines: string[]): void => {
  heading(lines, "Operations");
  if (snapshot.operations.length === 0) {
    lines.push("_No operations._");
    return;
  }
  lines.push("| Kind | Runtime | Description | Target |", "| --- | --- | --- | --- |");
  for (const op of snapshot.operations) lines.push(formatOperationRow(op));
};

const formatOperationRow = (op: OperationSummary): string => {
  const target = op.target !== undefined ? `\`${truncate(op.target, 40)}\`` : "—";
  const runtime = op.runtime ? "preview" : "source";
  return `| ${op.kind} | ${runtime} | ${escapeCell(op.description)} | ${escapeCell(target)} |`;
};

const renderJournal = (snapshot: VisionContextSnapshot, lines: string[]): void => {
  heading(lines, "Journal");
  const { journal } = snapshot;
  lines.push(`- **Entries:** ${journal.entryCount}`);
  lines.push(`- **Can undo:** ${journal.canUndo} (depth ${journal.undoDepth})`);
  lines.push(`- **Can redo:** ${journal.canRedo} (depth ${journal.redoDepth})`);
  if (journal.recentKinds.length > 0) {
    lines.push(`- **Recent kinds:** ${journal.recentKinds.join(", ")}`);
  }
};

const renderOrigins = (snapshot: VisionContextSnapshot, lines: string[]): void => {
  heading(lines, "Map Origins");
  if (snapshot.originsTruncated) {
    lines.push("_Origins truncated by map caps (C4)._");
  }
  if (snapshot.origins.length === 0) {
    lines.push("_No map origins resolved._");
    return;
  }
  for (const origin of snapshot.origins) renderOrigin(origin, lines);
};

const renderOrigin = (origin: MapOrigin, lines: string[]): void => {
  const label = origin.relativePath ?? origin.sourceUrl ?? "(unknown)";
  lines.push(`### ${label} — ${origin.confidence}`, "");
  if (origin.sourceUrl !== undefined) lines.push(`- **Source URL:** \`${origin.sourceUrl}\``);
  if (origin.mapUrl !== undefined) lines.push(`- **Map URL:** \`${origin.mapUrl}\``);
  if (origin.relativePath !== undefined) lines.push(`- **Path:** \`${origin.relativePath}\``);
  if (origin.startLine !== undefined) {
    const end = origin.endLine !== undefined ? `-${origin.endLine}` : "";
    lines.push(`- **Lines:** ${origin.startLine}${end}`);
  }
  if (origin.kind !== undefined) lines.push(`- **Kind:** ${origin.kind}`);
  if (origin.warnings.length > 0) {
    lines.push(`- **Warnings:** ${origin.warnings.join("; ")}`);
  }
  if (origin.snippet !== undefined && origin.snippet.length > 0) {
    lines.push("", "```tsx", origin.snippet, "```");
  }
  lines.push("");
};

const renderSourceConfidenceDetail = (snapshot: VisionContextSnapshot, lines: string[]): void => {
  if (snapshot.sourceConfidenceDetail === undefined) return;
  heading(lines, "Source Confidence Detail");
  const detail = snapshot.sourceConfidenceDetail;
  lines.push(`- **Method:** ${detail.method}`);
  if (detail.reasons.length > 0) lines.push(`- **Reasons:** ${detail.reasons.join("; ")}`);
  if (detail.warnings.length > 0) lines.push(`- **Warnings:** ${detail.warnings.join("; ")}`);
};

const renderWarnings = (snapshot: VisionContextSnapshot, lines: string[]): void => {
  if (snapshot.warnings.length === 0) return;
  heading(lines, "Warnings");
  for (const warning of snapshot.warnings) lines.push(formatWarning(warning));
};

const formatWarning = (warning: Warning): string => {
  const prefix = warning.source !== undefined ? `[${warning.source}] ` : "";
  return `- **${warning.severity}** ${prefix}${warning.message}`;
};

const renderPrivacyReport = (snapshot: VisionContextSnapshot, lines: string[]): void => {
  heading(lines, "Privacy Report");
  const { privacyReport } = snapshot;
  lines.push(`**Total redacted fields:** ${privacyReport.totalRedacted}`, "");
  if (privacyReport.redactions.length === 0) {
    lines.push("_No fields required redaction._");
    return;
  }
  lines.push("| Field | Rule | Layer | Reason |", "| --- | --- | --- | --- |");
  for (const entry of privacyReport.redactions) {
    lines.push(
      `| ${entry.field} | ${entry.patternId} | ${entry.source} | ${escapeCell(entry.description)} |`,
    );
  }
};

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max)}…`;

const escapeCell = (value: string): string => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
