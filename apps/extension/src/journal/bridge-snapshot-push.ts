/**
 * Background-owned MCP snapshot projection (ADR-020).
 *
 * When the bridge client is paired, compiles a redacted VisionContextSnapshot
 * from the extension SoT (selection + journal) and pushes it via
 * BridgeClient.pushSnapshot. Content never opens the MCP socket.
 */

import type { BridgeClient } from "@vision-control/bridge-client";
import type { Journal } from "@vision-control/change-journal";
import type { SelectionSummary } from "@vision-control/inspector-core";

import { buildPanelContextExport } from "../components/journal/context-export.js";

export interface BridgeSnapshotPushOptions {
  readonly getClient: () => BridgeClient | undefined;
  readonly getJournal: (tabId: number) => Journal;
  readonly getSessionId: (tabId: number) => string | undefined;
  readonly now?: () => number;
}

export interface BridgeSnapshotPushController {
  /** Cache selection for a tab and push when paired. */
  readonly noteSelection: (tabId: number, selection: SelectionSummary | null) => void;
  /** Push after journal SoT mutation when paired. */
  readonly noteJournalChanged: (tabId: number) => void;
  /** Push current SoT for a tab (e.g. immediately after pair). */
  readonly pushForTab: (tabId: number) => void;
  /** Drop per-tab selection + rev when the tab closes. */
  readonly clearTab: (tabId: number) => void;
  readonly dispose: () => void;
}

function isSelectionSummary(payload: unknown): payload is SelectionSummary {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "identity" in payload &&
    "semantic" in payload &&
    "breadcrumb" in payload
  );
}

/** Parse selection-summary bus payload (summary or clear). */
export function parseSelectionSummaryPayload(
  payload: unknown,
): SelectionSummary | null | undefined {
  if (payload === null) {
    return null;
  }
  if (isSelectionSummary(payload)) {
    return payload;
  }
  return undefined;
}

export function createBridgeSnapshotPushController(
  options: BridgeSnapshotPushOptions,
): BridgeSnapshotPushController {
  const now = options.now ?? Date.now;
  const selections = new Map<number, SelectionSummary | null>();
  const snapshotRevByTab = new Map<number, number>();

  const nextRev = (tabId: number): number => {
    const previous = snapshotRevByTab.get(tabId) ?? 0;
    const rev = previous + 1;
    snapshotRevByTab.set(tabId, rev);
    return rev;
  };

  const pushForTab = (tabId: number): void => {
    const client = options.getClient();
    if (client === undefined || client.state !== "connected") {
      return;
    }

    const selection = selections.get(tabId) ?? null;
    const journal = options.getJournal(tabId);
    const sessionId = options.getSessionId(tabId);
    const snapshotRev = nextRev(tabId);
    const tabIdStr = String(tabId);

    const { snapshot } = buildPanelContextExport({
      selection,
      journal,
      tabId: tabIdStr,
      snapshotRev,
      compiledAt: now(),
      ...(sessionId !== undefined ? { sessionId } : {}),
    });

    client.pushSnapshot({
      tabId: tabIdStr,
      snapshotRev,
      snapshot,
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  };

  return {
    noteSelection(tabId: number, selection: SelectionSummary | null): void {
      selections.set(tabId, selection);
      pushForTab(tabId);
    },

    noteJournalChanged(tabId: number): void {
      pushForTab(tabId);
    },

    pushForTab,

    clearTab(tabId: number): void {
      selections.delete(tabId);
      snapshotRevByTab.delete(tabId);
    },

    dispose(): void {
      selections.clear();
      snapshotRevByTab.clear();
    },
  };
}
