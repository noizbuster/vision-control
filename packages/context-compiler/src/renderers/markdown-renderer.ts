/**
 * Markdown renderer for a compiled context.
 *
 * Produces a human-readable Markdown document with one section per context
 * field: the goal, the selected target, an operations table, source candidates
 * with fenced code blocks, layout, the verification plan stub, warnings, and the
 * privacy report. Callers MUST pass an already-redacted context.
 */

import type {
  CompiledContext,
  OperationSummary,
  SourceCandidateSummary,
  Warning,
} from "../context-schema.js";

export const renderMarkdown = (context: CompiledContext): string => {
  const lines: string[] = [];
  lines.push("# Agent Context", "");
  lines.push(`**Goal:** ${context.goal}`, "");

  renderTarget(context, lines);
  renderOperations(context, lines);
  renderSource(context, lines);
  renderLayout(context, lines);
  renderVerificationPlan(context, lines);
  renderWarnings(context, lines);
  renderPrivacyReport(context, lines);
  renderMetadata(context, lines);

  return lines.join("\n");
};

const heading = (lines: string[], text: string): void => {
  lines.push("", `## ${text}`, "");
};

const renderTarget = (context: CompiledContext, lines: string[]): void => {
  heading(lines, "Selected Target");
  const { identity, semantic, boxModel } = context.target;
  lines.push(`- **Tag:** ${semantic.tagName}`);
  if (semantic.role !== undefined) lines.push(`- **Role:** ${semantic.role}`);
  if (semantic.name !== undefined) lines.push(`- **Name:** ${semantic.name}`);
  if (semantic.textContentPreview.length > 0) {
    lines.push(`- **Text:** ${truncate(semantic.textContentPreview, 100)}`);
  }
  if (identity.sourceId !== undefined) lines.push(`- **Source ID:** \`${identity.sourceId}\``);
  if (identity.fingerprint !== undefined)
    lines.push(`- **Fingerprint:** \`${identity.fingerprint}\``);
  if (identity.confidence !== undefined) lines.push(`- **Confidence:** ${identity.confidence}`);
  lines.push(
    `- **Box:** ${boxModel.contentWidth}×${boxModel.contentHeight} at (${boxModel.positionX}, ${boxModel.positionY})`,
  );
  if (context.target.breadcrumb.length > 0) {
    lines.push("", "**Breadcrumb:**", "");
    for (const item of context.target.breadcrumb) {
      const parts = [item.tagName];
      if (item.id !== undefined) parts.push(`#${item.id}`);
      lines.push(`- ${parts.join("")}`);
    }
  }
  renderStyleTable(context, lines);
  renderClassList(context, lines);
  renderAttributes(context, lines);
};

const renderStyleTable = (context: CompiledContext, lines: string[]): void => {
  const entries = Object.entries(context.target.computedStyle);
  if (entries.length === 0) return;
  lines.push("", "**Computed style:**", "");
  lines.push("| Property | Value |", "| --- | --- |");
  for (const [property, value] of entries) lines.push(`| ${property} | ${value} |`);
};

const renderClassList = (context: CompiledContext, lines: string[]): void => {
  if (context.target.classList.length === 0) return;
  lines.push("", "**Classes:**", "");
  for (const entry of context.target.classList) lines.push(`- \`${entry.name}\` (${entry.source})`);
};

const renderAttributes = (context: CompiledContext, lines: string[]): void => {
  if (context.target.attributes.length === 0) return;
  lines.push("", "**Attributes:**", "");
  lines.push("| Name | Value |", "| --- | --- |");
  for (const attr of context.target.attributes) lines.push(`| ${attr.name} | ${attr.value} |`);
};

const renderOperations = (context: CompiledContext, lines: string[]): void => {
  heading(lines, "Operations");
  if (context.operations.length === 0) {
    lines.push("_No operations._");
    return;
  }
  lines.push("| Kind | Runtime | Description | Target |", "| --- | --- | --- | --- |");
  for (const op of context.operations) lines.push(formatOperationRow(op));
};

const formatOperationRow = (op: OperationSummary): string => {
  const target = op.target !== undefined ? `\`${truncate(op.target, 40)}\`` : "—";
  const runtime = op.runtime ? "preview" : "source";
  return `| ${op.kind} | ${runtime} | ${escapeCell(op.description)} | ${escapeCell(target)} |`;
};

const renderSource = (context: CompiledContext, lines: string[]): void => {
  heading(lines, "Source");
  const { candidates } = context.source;
  if (candidates.length === 0) {
    lines.push("_No source candidates resolved._");
    return;
  }
  if (context.source.bestCandidateIndex !== undefined) {
    const best = context.source.candidates[context.source.bestCandidateIndex];
    if (best !== undefined) {
      lines.push(`**Best candidate:** ${best.confidence} confidence`, "");
    }
  }
  for (const candidate of candidates) renderCandidate(candidate, lines);
};

const renderCandidate = (candidate: SourceCandidateSummary, lines: string[]): void => {
  const label = candidate.componentName ?? candidate.workspaceRelativePath ?? "(unknown)";
  lines.push(`### ${label} — ${candidate.confidence}`, "");
  if (candidate.workspaceRelativePath !== undefined) {
    lines.push(`- **Path:** \`${candidate.workspaceRelativePath}\``);
  }
  if (candidate.staticClassName !== undefined && candidate.cssFilePath !== undefined) {
    lines.push(`- **CSS class:** \`${candidate.staticClassName}\` in \`${candidate.cssFilePath}\``);
  }
  if (candidate.warnings.length > 0) {
    lines.push(`- **Warnings:** ${candidate.warnings.join("; ")}`);
  }
  if (candidate.snippet !== undefined && candidate.snippet.length > 0) {
    lines.push("", "```tsx", candidate.snippet, "```");
  }
  lines.push("");
};

const renderLayout = (context: CompiledContext, lines: string[]): void => {
  heading(lines, "Layout");
  const { layout } = context;
  lines.push(`- **Parent:** ${layout.parentDisplay || layout.parentMode}`);
  if (layout.parentFlexDirection !== undefined) {
    lines.push(`- **Flex direction:** ${layout.parentFlexDirection}`);
  }
  lines.push(`- **Siblings:** ${layout.siblingCount} (this is #${layout.siblingIndex})`);
};

const renderVerificationPlan = (context: CompiledContext, lines: string[]): void => {
  heading(lines, "Verification Plan");
  const { verificationPlan } = context;
  lines.push(`_Notes:_ ${verificationPlan.notes}`, "");
  if (verificationPlan.assertions.length === 0) {
    lines.push("_No assertions yet (pending verification engine)._");
    return;
  }
  lines.push("**Assertions:**", "");
  for (const assertion of verificationPlan.assertions) {
    lines.push(`- ${assertion.description}`);
  }
};

const renderWarnings = (context: CompiledContext, lines: string[]): void => {
  if (context.warnings.length === 0) return;
  heading(lines, "Warnings");
  for (const warning of context.warnings) lines.push(formatWarning(warning));
};

const formatWarning = (warning: Warning): string => {
  const prefix = warning.source !== undefined ? `[${warning.source}] ` : "";
  return `- **${warning.severity}** ${prefix}${warning.message}`;
};

const renderPrivacyReport = (context: CompiledContext, lines: string[]): void => {
  heading(lines, "Privacy Report");
  const { privacyReport } = context;
  lines.push(`**Total redacted fields:** ${privacyReport.totalRedacted}`, "");
  if (privacyReport.redactions.length === 0) {
    lines.push("_No fields required redaction._");
    return;
  }
  lines.push("| Field | Rule | Reason |", "| --- | --- | --- |");
  for (const entry of privacyReport.redactions) {
    lines.push(`| ${entry.field} | ${entry.patternId} | ${escapeCell(entry.description)} |`);
  }
};

const renderMetadata = (context: CompiledContext, lines: string[]): void => {
  heading(lines, "Metadata");
  const { metadata } = context;
  lines.push(`- **Compiled at:** ${new Date(metadata.compiledAt).toISOString()}`);
  lines.push(`- **Format version:** ${metadata.formatVersion}`);
  lines.push(`- **Token estimate:** ${metadata.tokenEstimate} / ${metadata.tokenBudget}`);
  lines.push(`- **Operations:** ${metadata.operationCount}`);
  if (metadata.truncated) {
    lines.push(`- **Truncated sections:** ${metadata.truncatedSections.join(", ")}`);
  }
};

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max)}…`;

const escapeCell = (value: string): string => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
