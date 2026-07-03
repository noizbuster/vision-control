import type { Operation } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type {
  GridCellPlacement,
  GridReorderCandidateSet,
  GridSpanCandidate,
} from "@vision-control/layout-engine";

import type { BusMessage, ConnectionState, TabSession } from "./types.js";

export function createSelectionSummaryMessage(summary: SelectionSummary): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `selection-summary-${Date.now()}`,
    messageType: "selection-summary",
    targetRoute: "panel",
    payload: summary,
    timestamp: Date.now(),
  };
}

export function createSelectElementMessage(selector: string): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `select-element-${Date.now()}`,
    messageType: "select-element",
    targetRoute: "background",
    payload: { selector },
    timestamp: Date.now(),
  };
}

export function createSessionUpdateMessage(tabId: number, session: TabSession): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `session-${tabId}-${Date.now()}`,
    messageType: "session-update",
    targetRoute: "panel",
    payload: { tabId, session },
    timestamp: Date.now(),
  };
}

export function createConnectionStateMessage(state: ConnectionState): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `connection-state-${Date.now()}`,
    messageType: "connection-state",
    targetRoute: "panel",
    payload: { state },
    timestamp: Date.now(),
  };
}

export function createEditorCommandMessage(operation: Operation): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `editor-command-${Date.now()}`,
    messageType: "editor-command",
    targetRoute: "background",
    payload: operation,
    timestamp: Date.now(),
  };
}

export function createReorderOperationMessage(operation: Operation): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `reorder-operation-${Date.now()}`,
    messageType: "reorder-operation",
    targetRoute: "panel",
    payload: operation,
    timestamp: Date.now(),
  };
}

export function createInteractionOperationMessage(operation: Operation): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `interaction-operation-${Date.now()}`,
    messageType: "interaction-operation",
    targetRoute: "panel",
    payload: operation,
    timestamp: Date.now(),
  };
}

/**
 * Panel-bound payload describing the inferred grid placement of the currently
 * selected grid child. Emitted by the content-side overlay runtime (the
 * counterpart to {@link createSelectionSummaryMessage}) and consumed by the
 * `useGridPlacement` hook to feed the V1V2 InspectorPanel grid slot. `null`
 * placement clears the slot (selected element is not a grid item).
 */
export interface GridPlacementMessage {
  readonly gridContainer: ElementRef;
  readonly child: ElementRef;
  readonly placement: GridCellPlacement | null;
  readonly spanCandidates: readonly GridSpanCandidate[];
  readonly reorderChoice: GridReorderCandidateSet | null;
  readonly a11yWarning: string | null;
}

export function createMultiSelectGroupMessage(group: MultiSelectGroup): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `multi-select-group-${Date.now()}`,
    messageType: "multi-select-group",
    targetRoute: "panel",
    payload: group,
    timestamp: Date.now(),
  };
}

export function createGridPlacementMessage(state: GridPlacementMessage): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `grid-placement-${Date.now()}`,
    messageType: "grid-placement",
    targetRoute: "panel",
    payload: state,
    timestamp: Date.now(),
  };
}
