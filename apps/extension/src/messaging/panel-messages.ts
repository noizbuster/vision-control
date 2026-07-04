import type { Operation } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type {
  GridCellPlacement,
  GridReorderCandidateSet,
  GridSpanCandidate,
} from "@vision-control/layout-engine";
// Type-only imports from source-resolver (platform:node) are boundary-safe: they
// are erased at compile time and pull zero runtime code into the browser bundle.
// The symmetric `browser-imports-node` checker (task 1) skips type-only imports.
import type {
  BoundaryKind,
  OwnershipContext,
  PropFlowWarningSeverity,
} from "@vision-control/source-resolver";

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

export function createEditorCommandMessage(operation: Operation, tabId?: number): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `editor-command-${Date.now()}`,
    messageType: "editor-command",
    targetRoute: "background",
    ...(tabId !== undefined ? { tabId } : {}),
    payload: operation,
    timestamp: Date.now(),
  };
}

export function createClearPreviewMessage(tabId?: number): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `clear-preview-${Date.now()}`,
    messageType: "clear-preview",
    targetRoute: "background",
    ...(tabId !== undefined ? { tabId } : {}),
    payload: {},
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

/**
 * Serializable mirror of `@vision-control/source-resolver`'s `PropFlowWarning`.
 * The daemon computes warnings via the real `propFlowWarnings` (platform:node)
 * and serialises them into this shape so the browser-side panel can apply the
 * full `hasBlockingWarning` semantics without value-importing source-resolver.
 */
export interface PropFlowWarningEntry {
  readonly code: string;
  readonly message: string;
  readonly severity: PropFlowWarningSeverity;
  readonly context: OwnershipContext;
  readonly boundary: BoundaryKind;
}

/**
 * One daemon-resolved editable prop on the selected element, carried on the wire
 * from daemon→background→panel. Structurally compatible with PropsPanel's
 * `EditableProp` so the panel consumes it directly.
 */
export interface ComponentPropEntry {
  readonly name: string;
  readonly value: string;
  readonly kind: "dom-attribute" | "component-prop";
  readonly componentName?: string;
  readonly sourceRange?: {
    readonly startLine: number;
    readonly startColumn: number;
    readonly endLine: number;
    readonly endColumn: number;
  };
  readonly ownershipContext?: OwnershipContext;
  readonly boundary?: BoundaryKind;
  readonly warnings?: readonly PropFlowWarningEntry[];
}

/**
 * Panel-bound payload: the daemon-resolved props for one selected element.
 * The `elementId` matches the `request-component-props` signal so the panel
 * discards stale responses from a superseded selection (adversarial: stale_state).
 */
export interface ComponentPropsPayload {
  readonly elementId: string;
  readonly props: readonly ComponentPropEntry[];
}

export function createComponentPropsMessage(payload: ComponentPropsPayload): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `component-props-${Date.now()}`,
    messageType: "component-props",
    targetRoute: "panel",
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Selection identity the panel sends to the background to request daemon-side
 * prop discovery. The background forwards this to the daemon source-resolver
 * (the `discoverProps`/`propFlowWarnings` functions are platform:node and must
 * not run in the browser — symmetric `browser-imports-node` rule from task 1).
 */
export interface RequestComponentPropsPayload {
  readonly elementId: string;
  readonly tagName: string;
  readonly sourceId?: string;
  readonly componentName?: string;
  readonly ownershipContext?: OwnershipContext;
  readonly boundary?: BoundaryKind;
}

export function createRequestComponentPropsMessage(
  payload: RequestComponentPropsPayload,
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `request-component-props-${Date.now()}`,
    messageType: "request-component-props",
    targetRoute: "background",
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Panel → background signal carrying the daemon pairing URL. The background
 * re-parses this with {@link parsePairingUrl} and drives the ReconnectManager;
 * the panel never talks to the daemon directly.
 */
export interface DaemonConnectPayload {
  readonly pairingUrl: string;
}

export function createDaemonConnectMessage(pairingUrl: string): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `daemon-connect-${Date.now()}`,
    messageType: "daemon-connect",
    targetRoute: "background",
    payload: { pairingUrl } satisfies DaemonConnectPayload,
    timestamp: Date.now(),
  };
}

export function createDaemonDisconnectMessage(): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `daemon-disconnect-${Date.now()}`,
    messageType: "daemon-disconnect",
    targetRoute: "background",
    payload: {},
    timestamp: Date.now(),
  };
}
