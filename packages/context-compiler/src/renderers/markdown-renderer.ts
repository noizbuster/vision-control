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
  renderMultiSelect(context, lines);
  renderBreakpoint(context, lines);
  renderSourceConfidenceDetail(context, lines);
  renderLayoutContext(context, lines);
  renderSuggestedDiffs(context, lines);
  renderScreenshotRef(context, lines);
  renderTokenRegistry(context, lines);
  renderComponentProps(context, lines);
  renderVerificationPlan(context, lines);
  renderWarnings(context, lines);
  renderAdapterWarnings(context, lines);
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

const renderMultiSelect = (context: CompiledContext, lines: string[]): void => {
  if (context.multiSelect === undefined) return;
  heading(lines, "Multi-Select Group");
  lines.push(`- **Group ID:** \`${context.multiSelect.groupId}\``);
  lines.push(`- **Targets:** ${context.multiSelect.targets.length}`);
  for (const target of context.multiSelect.targets) {
    const parts: string[] = [];
    if (target.sourceId !== undefined) parts.push(`source \`${target.sourceId}\``);
    if (target.runtimeId !== undefined) parts.push(`runtime \`${target.runtimeId}\``);
    if (target.fingerprint !== undefined) parts.push(`fingerprint \`${target.fingerprint}\``);
    lines.push(`  - ${parts.length > 0 ? parts.join(", ") : "(no identity)"}`);
  }
};

const renderBreakpoint = (context: CompiledContext, lines: string[]): void => {
  if (context.breakpoint === undefined) return;
  heading(lines, "Breakpoint Context");
  const bp = context.breakpoint;
  lines.push(`- **Active viewport:** ${bp.activeViewport}`);
  if (bp.mediaQuerySource !== undefined)
    lines.push(`- **Media query:** \`${bp.mediaQuerySource}\``);
  if (bp.responsivePrefix !== undefined)
    lines.push(`- **Responsive prefix:** ${bp.responsivePrefix}`);
  if (bp.scopedChangeCount !== undefined) {
    lines.push(`- **Scoped changes:** ${bp.scopedChangeCount}`);
  }
};

const renderSourceConfidenceDetail = (context: CompiledContext, lines: string[]): void => {
  if (context.sourceConfidenceDetail === undefined) return;
  heading(lines, "Source Confidence Detail");
  const detail = context.sourceConfidenceDetail;
  lines.push(`- **Method:** ${detail.method}`);
  if (detail.reasons.length > 0) {
    lines.push(`- **Reasons:** ${detail.reasons.join("; ")}`);
  }
  if (detail.warnings.length > 0) {
    lines.push(`- **Warnings:** ${detail.warnings.join("; ")}`);
  }
};

const renderLayoutContext = (context: CompiledContext, lines: string[]): void => {
  if (context.layoutContext === undefined) return;
  heading(lines, "Layout Context (Grid / Auto Layout)");
  const lc = context.layoutContext;
  if (lc.gridColumns !== undefined) lines.push(`- **Grid columns:** ${lc.gridColumns}`);
  if (lc.gridRows !== undefined) lines.push(`- **Grid rows:** ${lc.gridRows}`);
  if (lc.autoLayout !== undefined) lines.push(`- **Auto Layout:** ${lc.autoLayout}`);
};

const renderSuggestedDiffs = (context: CompiledContext, lines: string[]): void => {
  if (context.suggestedDiffs === undefined || context.suggestedDiffs.length === 0) return;
  heading(lines, "Suggested Diffs (Inert \u2014 ADR-012)");
  lines.push("_Candidate data only. Never applied by the runtime or MCP._", "");
  for (const [i, suggestion] of context.suggestedDiffs.entries()) {
    lines.push(`### Suggestion ${i + 1} \u2014 ${suggestion.confidence}`, "");
    lines.push(`- **Confidence:** ${suggestion.confidence}`);
    if (suggestion.kind !== undefined) lines.push(`- **Kind:** \`${suggestion.kind}\``);
    if (suggestion.sourceRanges !== undefined && suggestion.sourceRanges.length > 0) {
      const ranges = suggestion.sourceRanges
        .map((r) => `L${r.startLine}:${r.startColumn}-${r.endLine}:${r.endColumn}`)
        .join(", ");
      lines.push(`- **Source ranges:** ${ranges}`);
    }
    if (suggestion.preconditions.length > 0) {
      lines.push(`- **Preconditions:** ${suggestion.preconditions.join("; ")}`);
    }
    lines.push("", "```diff", suggestion.diff, "```", "");
  }
};

const renderScreenshotRef = (context: CompiledContext, lines: string[]): void => {
  if (context.screenshotRef === undefined) return;
  heading(lines, "Screenshot Reference (Opt-In \u2014 ADR-011)");
  const ref = context.screenshotRef;
  lines.push(`- **Artifact ID:** \`${ref.artifactId}\``);
  if (ref.redactionReport !== undefined) {
    lines.push(`- **Redaction report:** \`${ref.redactionReport}\``);
  }
  if (ref.redactionSummary !== undefined) {
    lines.push(
      `- **Redaction summary:** ${ref.redactionSummary.totalMasked} masked, recheck: ${ref.redactionSummary.postCaptureRecheck}`,
    );
  }
  lines.push("", "_Metadata reference only. No image data is exported._");
};

const renderTokenRegistry = (context: CompiledContext, lines: string[]): void => {
  if (context.tokenRegistry === undefined) return;
  heading(lines, "Token Registry");
  const tr = context.tokenRegistry;
  lines.push(`- **Total tokens:** ${tr.totalTokens}`);
  if (tr.conflictCount > 0) {
    lines.push(`- **Conflicts:** ${tr.conflictCount}`);
  }
  if (tr.sources.length > 0) {
    lines.push(`- **Sources:** ${tr.sources.join(", ")}`);
  }
  const categories = Object.entries(tr.categories);
  if (categories.length > 0) {
    lines.push("", "**Categories:**", "");
    for (const [category, count] of categories) lines.push(`- ${category}: ${count}`);
  }
};

const renderComponentProps = (context: CompiledContext, lines: string[]): void => {
  if (context.componentProps === undefined) return;
  heading(lines, "Component Props");
  const cp = context.componentProps;
  lines.push(`- **Component:** ${cp.componentName}`);
  lines.push(`- **Framework:** ${cp.framework}`);
  lines.push(`- **Ownership risk:** ${cp.ownershipRisk}`);
  if (cp.warnings.length > 0) {
    lines.push(`- **Warnings:** ${cp.warnings.join("; ")}`);
  }
  if (cp.props.length > 0) {
    lines.push("", "**Props:**", "");
    lines.push("| Name | Kind | Editable | Value |", "| --- | --- | --- | --- |");
    for (const prop of cp.props) {
      const value = prop.value ?? "—";
      const editable = prop.editable ? "yes" : "no";
      lines.push(`| ${prop.name} | ${prop.kind} | ${editable} | ${escapeCell(value)} |`);
    }
  }
};

const renderAdapterWarnings = (context: CompiledContext, lines: string[]): void => {
  if (context.adapterWarnings === undefined || context.adapterWarnings.length === 0) return;
  heading(lines, "Adapter Warnings");
  for (const warning of context.adapterWarnings) lines.push(formatWarning(warning));
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
  lines.push("| Field | Rule | Layer | Reason |", "| --- | --- | --- | --- |");
  for (const entry of privacyReport.redactions) {
    lines.push(
      `| ${entry.field} | ${entry.patternId} | ${entry.source} | ${escapeCell(entry.description)} |`,
    );
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
