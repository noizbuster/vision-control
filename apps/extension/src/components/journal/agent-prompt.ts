/**
 * Agent handoff prompt from the local panel snapshot.
 *
 * Uses journal + selection + optional map origins through
 * {@link buildPanelContextExport} / compileVisionContextSnapshot (always
 * redacted). Works unpaired — no MCP or daemon. Empty origins still include
 * IR operations from the journal.
 */

import type { Journal, JournalEntry } from "@vision-control/change-journal";
import type { MapOrigin } from "@vision-control/context-compiler";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { redactObject, redactString } from "@vision-control/security";

import { formatVerificationPlan } from "./agent-prompt-verification.js";
import { buildPanelContextExport } from "./context-export.js";

/** Inputs available in the DevTools panel without an agent pair. */
export interface AgentPromptInput {
  readonly selection: SelectionSummary | null;
  readonly journal: Journal;
  /** Inspected page URL when known (redacted in the prompt). */
  readonly inspectedUrl?: string | null;
  /** Map origins when available; empty/omitted is valid and keeps IR ops. */
  readonly origins?: readonly MapOrigin[];
  readonly originsTruncated?: boolean;
  readonly tabId?: string;
  readonly sessionId?: string;
  readonly snapshotRev?: number;
  readonly compiledAt?: number;
}

/**
 * Build a redacted agent handoff prompt from local extension state.
 * Does not call MCP or the daemon.
 */
export function buildAgentPrompt(input: AgentPromptInput): string {
  const exported = buildPanelContextExport({
    selection: input.selection,
    journal: input.journal,
    ...(input.origins !== undefined ? { origins: input.origins } : {}),
    ...(input.originsTruncated !== undefined ? { originsTruncated: input.originsTruncated } : {}),
    ...(input.tabId !== undefined ? { tabId: input.tabId } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.snapshotRev !== undefined ? { snapshotRev: input.snapshotRev } : {}),
    ...(input.compiledAt !== undefined ? { compiledAt: input.compiledAt } : {}),
  });

  const redactedUrl =
    input.inspectedUrl === undefined || input.inspectedUrl === null
      ? "unknown"
      : redactString(input.inspectedUrl);

  const sortedEntries = [...input.journal.entries].sort(
    (left, right) => left.sequence - right.sequence,
  );

  return [
    "# Vision Control Agent Handoff",
    "Apply the visual edit intent below to the source code. Treat browser preview mutations as intent only; they are not source changes. This prompt is compiled from local panel state and works while agent-disconnected.",
    "## Page",
    `URL: ${redactedUrl}`,
    "## Local Context Snapshot",
    "Portable snapshot from the extension journal and selection. Map origins are optional hints; empty origins do not drop IR operations.",
    exported.markdown,
    "## Verification Plan",
    formatVerificationPlan(redactEntries(sortedEntries)),
    "## Agent Instructions",
    "- Locate the owning source files from the URL, selectors, source id, map origins, and operation targets.",
    "- Apply the smallest source patch that preserves the recorded visual intent.",
    "- Do not add source-mutating MCP tools or treat the runtime preview as source truth.",
    "- Verify against the actual source after reload or HMR, not just the existing preview overlay.",
    "- MCP pair is optional; this handoff is complete from local panel state alone.",
  ].join("\n\n");
}

function redactEntries(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return redactObject(JSON.parse(JSON.stringify(entries))) as readonly JournalEntry[];
}
