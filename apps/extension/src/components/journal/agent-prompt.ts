import type { ElementRef } from "@vision-control/change-ir";
import type { JournalEntry } from "@vision-control/change-journal";
import { redactInspectorSummary, type SelectionSummary } from "@vision-control/inspector-core";
import { redactObject, redactString } from "@vision-control/security";
import { formatVerificationPlan } from "./agent-prompt-verification.js";

interface AgentPromptInput {
  readonly inspectedUrl: string | null;
  readonly selection: SelectionSummary | null;
  readonly entries: readonly JournalEntry[];
}

const EMPTY_VALUE = "-";

function valueOrDash(value: string | undefined): string {
  return value === undefined || value.length === 0 ? EMPTY_VALUE : value;
}

function formatPoint(x: number, y: number): string {
  return `${x}, ${y}`;
}

function formatBox(selection: SelectionSummary): string {
  const { boxModel } = selection;
  return [
    `- Content: ${boxModel.content.width} x ${boxModel.content.height}`,
    `- Position: ${formatPoint(boxModel.position.x, boxModel.position.y)}`,
    `- Margin: ${boxModel.margin.top}/${boxModel.margin.right}/${boxModel.margin.bottom}/${boxModel.margin.left}`,
    `- Border: ${boxModel.border.top}/${boxModel.border.right}/${boxModel.border.bottom}/${boxModel.border.left}`,
    `- Padding: ${boxModel.padding.top}/${boxModel.padding.right}/${boxModel.padding.bottom}/${boxModel.padding.left}`,
  ].join("\n");
}

function formatElementRef(ref: ElementRef): string {
  const source = ref.sourceId !== undefined ? ` sourceId=${ref.sourceId}` : "";
  const selector = ref.selector !== undefined ? ` selector=${ref.selector}` : "";
  return `${ref.runtimeId}${source}${selector}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isElementRef(value: unknown): value is ElementRef {
  return isObject(value) && typeof value.runtimeId === "string";
}

function collectElementRefs(value: unknown, refs: ElementRef[] = []): readonly ElementRef[] {
  if (Array.isArray(value)) {
    for (const item of value) collectElementRefs(item, refs);
    return refs;
  }

  if (!isObject(value)) return refs;

  if (isElementRef(value)) refs.push(value);

  for (const item of Object.values(value)) {
    collectElementRefs(item, refs);
  }
  return refs;
}

function uniqueElementRefs(entries: readonly JournalEntry[]): readonly ElementRef[] {
  const refs = entries.flatMap((entry) => [...collectElementRefs(entry.operation)]);
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.runtimeId}:${ref.sourceId ?? ""}:${ref.selector ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatSelection(selection: SelectionSummary | null): string {
  if (selection === null) {
    return "No element is currently selected in the dev panel.";
  }

  const { computedStyle, identity, semantic } = selection;
  const breadcrumb = selection.breadcrumb
    .map((item) => item.selector ?? item.id ?? item.className ?? item.tagName)
    .join(" > ");
  const classNames = selection.classList.map((entry) => entry.name).join(" ");
  const attributes = selection.attributes
    .map((entry) => `${entry.name}=${JSON.stringify(entry.value)}`)
    .join(", ");

  return [
    `- Runtime ID: ${identity.runtimeId}`,
    `- Source ID: ${valueOrDash(identity.sourceId)}`,
    `- Selector: ${valueOrDash(identity.selector)}`,
    `- Frame ID: ${identity.frameId}`,
    `- Confidence: ${selection.sourceConfidence}`,
    `- Active breakpoint: ${valueOrDash(selection.activeBreakpoint)}`,
    `- Tag: ${semantic.tagName}`,
    `- Role: ${valueOrDash(semantic.role)}`,
    `- Name: ${valueOrDash(semantic.name)}`,
    `- Text preview: ${valueOrDash(semantic.textContentPreview)}`,
    `- Breadcrumb: ${valueOrDash(breadcrumb)}`,
    `- Classes: ${valueOrDash(classNames)}`,
    `- Attributes: ${valueOrDash(attributes)}`,
    `- Parent layout: ${selection.parentLayout.mode} (${valueOrDash(selection.parentLayout.display)})`,
    `- Sibling index: ${selection.siblingSummary.index} of ${selection.siblingSummary.count} in <${selection.siblingSummary.parentTagName}>`,
    "- Computed style:",
    `  - display: ${computedStyle.display}`,
    `  - position: ${computedStyle.position}`,
    `  - flex-direction: ${computedStyle.flexDirection}`,
    `  - align-items: ${computedStyle.alignItems}`,
    `  - justify-content: ${computedStyle.justifyContent}`,
    `  - width: ${computedStyle.width}`,
    `  - height: ${computedStyle.height}`,
    `  - padding: ${computedStyle.padding}`,
    `  - margin: ${computedStyle.margin}`,
    "- Box model:",
    formatBox(selection),
  ].join("\n");
}

function formatSourceContext(
  selection: SelectionSummary | null,
  entries: readonly JournalEntry[],
): string {
  const refs = uniqueElementRefs(entries);
  const lines = [
    selection === null
      ? "- Selected source id: unavailable"
      : `- Selected source id: ${valueOrDash(selection.identity.sourceId)}`,
    selection === null
      ? "- Selected source snippet: unavailable"
      : `- Selected source snippet: ${selection.identity.sourceSnippet === undefined ? "not captured in the panel" : "captured below"}`,
    refs.length === 0
      ? "- Operation element refs: none"
      : `- Operation element refs: ${refs.map(formatElementRef).join("; ")}`,
    "- Source candidates: not embedded in this panel prompt. Resolve them before editing with the local read-only Vision Control context tools when available, especially `vision_get_source_context`, `vision_get_selection`, and `vision_get_changeset`.",
  ];

  if (selection?.identity.sourceSnippet !== undefined) {
    lines.push("", "```tsx", selection.identity.sourceSnippet, "```");
  }

  return lines.join("\n");
}

function formatJournalEntry(entry: JournalEntry, index: number): string {
  const body = {
    id: entry.id,
    changeSetId: entry.changeSetId,
    transactionId: entry.transactionId,
    sequence: entry.sequence,
    actor: entry.actor,
    status: entry.status,
    createdAt: new Date(entry.createdAt).toISOString(),
    appliedAt: new Date(entry.appliedAt).toISOString(),
    operation: entry.operation,
    inverse: entry.inverse,
    preconditions: entry.preconditions,
    evidence: entry.evidence,
    beforeSnapshot: entry.beforeSnapshot,
    afterSnapshot: entry.afterSnapshot,
  };

  return [
    `### ${index + 1}. ${entry.operation.kind}`,
    "",
    "```json",
    JSON.stringify(body, null, 2),
    "```",
  ].join("\n");
}

function sortedEntries(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return [...entries].sort((left, right) => left.sequence - right.sequence);
}

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function redactEntries(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return redactObject(jsonRoundTrip(entries)) as readonly JournalEntry[];
}

function redactSelection(selection: SelectionSummary | null): SelectionSummary | null {
  return selection === null ? null : redactInspectorSummary(jsonRoundTrip(selection));
}

function formatJournal(entries: readonly JournalEntry[]): string {
  if (entries.length === 0) {
    return "No changes are currently recorded in the change journal.";
  }

  return sortedEntries(entries).map(formatJournalEntry).join("\n\n");
}

export function buildAgentPrompt({ inspectedUrl, selection, entries }: AgentPromptInput): string {
  const redactedUrl = inspectedUrl === null ? "unknown" : redactString(inspectedUrl);
  const redactedSelection = redactSelection(selection);
  const redactedEntries = redactEntries(entries);

  return [
    "# Vision Control Agent Handoff",
    "Apply the visual edit intent below to the source code. Treat browser preview mutations as intent only; they are not source changes.",
    "## Page",
    `URL: ${redactedUrl}`,
    "## Current Element Context",
    formatSelection(redactedSelection),
    "## Source Context Hints",
    formatSourceContext(redactedSelection, redactedEntries),
    "## Change Journal",
    formatJournal(redactedEntries),
    "## Verification Plan",
    formatVerificationPlan(redactedEntries),
    "## Agent Instructions",
    "- Locate the owning source files from the URL, selector, source id, and operation targets.",
    "- Apply the smallest source patch that preserves the recorded visual intent.",
    "- Do not add source-mutating MCP tools or treat the runtime preview as source truth.",
    "- Verify against the actual source after reload or HMR, not just the existing preview overlay.",
  ].join("\n\n");
}
