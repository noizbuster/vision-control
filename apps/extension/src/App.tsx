import type { Operation } from "@vision-control/change-ir";
import type { AlignmentCommandKind } from "@vision-control/layout-engine";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { type PropEditCommand, PropsPanel } from "./components/editors/PropsPanel.js";
import { HostAllowlistPanel } from "./components/HostAllowlistPanel.js";
import { AlignmentPanel } from "./components/inspector/AlignmentPanel.js";
import { AutoLayoutPanel } from "./components/inspector/AutoLayoutPanel.js";
import { InspectorPanel } from "./components/inspector/InspectorPanel.js";
import { buildAgentPrompt } from "./components/journal/agent-prompt.js";
import { ChangeJournal } from "./components/journal/ChangeJournal.js";
import { PairingPanel } from "./components/PairingPanel.js";
import { useComponentProps } from "./hooks/useComponentProps.js";
import { useConnectionState } from "./hooks/useConnectionState.js";
import { useContextExport } from "./hooks/useContextExport.js";
import type { EditorMode } from "./hooks/useEditor.js";
import { useEditor } from "./hooks/useEditor.js";
import { useFrameTree } from "./hooks/useFrameTree.js";
import { useGridPlacement } from "./hooks/useGridPlacement.js";
import { useInspectedTab } from "./hooks/useInspectedTab.js";
import { useJournal } from "./hooks/useJournal.js";
import { useJournalPersistence } from "./hooks/useJournalPersistence.js";
import { useMultiSelect } from "./hooks/useMultiSelect.js";
import { usePanelBus } from "./hooks/usePanelBus.js";
import { useSelectionSummary } from "./hooks/useSelectionSummary.js";
import { useSession } from "./hooks/useSession.js";
import { useTheme } from "./hooks/useTheme.js";
import {
  buildAlignmentOperation,
  buildGridReorderOperation,
  buildGridSpanOperation,
} from "./inspector-slot-commands.js";
import {
  isPanelInteractionMode,
  sendInteractionModeToRouteableFrames,
} from "./interaction-mode-routing.js";
import type { BusMessage, FrameInfo } from "./messaging/index.js";
import {
  createBridgeConnectMessage,
  createBridgeDisconnectMessage,
  createClearPreviewMessage,
  createEditorCommandMessage,
} from "./messaging/index.js";
import "./styles/variables.css";
import "./styles/inspector.css";
import "./styles/journal.css";

function FrameTreeItem({ frame }: { readonly frame: FrameInfo }): ReactElement {
  return (
    <li
      className={`frame-tree__item frame-tree__item--${frame.routeable ? "routeable" : "opaque"}`}
    >
      <span className="frame-tree__frame-id">{frame.frameId}</span>
      <span className="frame-tree__origin">{frame.origin || "unknown"}</span>
      <span className="frame-tree__routeable">{frame.routeable ? "routeable" : "opaque"}</span>
    </li>
  );
}

export function App(): ReactElement {
  const { theme } = useTheme();
  const { tabId, title, url } = useInspectedTab();
  const bus = usePanelBus();
  const connectionState = useConnectionState(bus);
  const session = useSession(bus, tabId);
  const frames = useFrameTree(bus, tabId);
  const { summary, selectElement } = useSelectionSummary(bus);
  const { group: multiSelectGroup } = useMultiSelect(bus);
  const { state: gridPlacementState } = useGridPlacement(bus);
  const { componentProps } = useComponentProps(bus, summary);
  const editor = useEditor();
  const routedInteractionMode = isPanelInteractionMode(editor.state.mode)
    ? editor.state.mode
    : null;
  const routeableFrameKey = frames
    .filter((frame) => frame.routeable)
    .map((frame) => frame.frameId)
    .join(",");
  const lastInteractionRouteRef = useRef<string | null>(null);
  const dispatchOperation = useCallback(
    (operation: Parameters<typeof createEditorCommandMessage>[0]): void => {
      if (bus === undefined) return;
      bus.send("background", createEditorCommandMessage(operation, tabId ?? undefined));
    },
    [bus, tabId],
  );
  const dispatchClear = useCallback((): void => {
    if (bus === undefined) return;
    bus.send("background", createClearPreviewMessage(tabId ?? undefined));
  }, [bus, tabId]);
  const journal = useJournal({ connectionState, dispatchOperation, dispatchClear });
  const contextExport = useContextExport({
    selection: summary,
    journal: journal.journal,
    ...(tabId !== undefined && tabId !== null ? { tabId } : {}),
    ...(session?.sessionId !== undefined ? { sessionId: session.sessionId } : {}),
  });
  const [agentPromptCopyState, setAgentPromptCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const agentPrompt = useMemo(
    () =>
      buildAgentPrompt({
        inspectedUrl: url ?? null,
        selection: summary,
        entries: journal.entries,
      }),
    [url, summary, journal.entries],
  );
  const recordRemoteRef = useRef(journal.recordRemote);
  recordRemoteRef.current = journal.recordRemote;
  useEffect(() => {
    if (bus === undefined) return;
    const recordRemoteOperation = (message: BusMessage): void => {
      const payload = message.payload;
      if (
        typeof payload !== "object" ||
        payload === null ||
        typeof (payload as { kind?: unknown }).kind !== "string" ||
        typeof (payload as { id?: unknown }).id !== "string"
      ) {
        return;
      }
      recordRemoteRef.current(payload as Operation);
    };
    const unsubscribeInspectorEdit = bus.on("inspector-edit", recordRemoteOperation);
    const unsubscribeInteractionOperation = bus.on("interaction-operation", recordRemoteOperation);
    return () => {
      unsubscribeInspectorEdit();
      unsubscribeInteractionOperation();
    };
  }, [bus]);
  useJournalPersistence({
    journal: journal.journal,
    tabId,
    bus,
    onRestore: journal.replaceJournal,
  });
  useEffect(() => {
    setAgentPromptCopyState("idle");
  }, [agentPrompt]);
  useEffect(() => {
    if (bus === undefined || tabId === undefined || tabId === null) return;
    const routeKey = `${tabId}:${routedInteractionMode ?? "none"}:${routeableFrameKey}`;
    if (lastInteractionRouteRef.current === routeKey) return;
    lastInteractionRouteRef.current = routeKey;
    sendInteractionModeToRouteableFrames(bus, tabId, frames, routedInteractionMode);
  }, [bus, frames, routeableFrameKey, routedInteractionMode, tabId]);

  const handleEditorCommand = (command: Parameters<typeof createEditorCommandMessage>[0]): void => {
    editor.actions.addPendingOperation(command);
    journal.record(command);
    if (bus !== undefined) {
      bus.send("background", createEditorCommandMessage(command, tabId ?? undefined));
    }
  };

  const handleAlignmentCommand = (kind: AlignmentCommandKind): void => {
    if (multiSelectGroup === null) return;
    const op = buildAlignmentOperation(multiSelectGroup, kind);
    if (op !== null) handleEditorCommand(op);
  };

  const handleGridChoosePlacement = (choice: "dom-order" | "grid-area"): void => {
    if (gridPlacementState === null) return;
    handleEditorCommand(buildGridReorderOperation(gridPlacementState, choice));
  };

  const handleGridResizeSpan = (axis: "column" | "row", toSpan: number): void => {
    if (gridPlacementState === null) return;
    handleEditorCommand(buildGridSpanOperation(gridPlacementState, axis, toSpan));
  };

  const handlePropCommand = (command: PropEditCommand): void => {
    handleEditorCommand(command);
  };

  const handleEditorModeChange = (mode: EditorMode): void => {
    editor.actions.setMode(mode);
  };

  const handleConnect = (pairingUrl: string): void => {
    if (bus !== undefined) {
      bus.send("background", createBridgeConnectMessage(pairingUrl));
    }
  };

  const handleDisconnect = (): void => {
    if (bus !== undefined) {
      bus.send("background", createBridgeDisconnectMessage());
    }
  };

  const handleCopyAgentPrompt = useCallback((): void => {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setAgentPromptCopyState("error");
      return;
    }

    void clipboard.writeText(agentPrompt).then(
      () => {
        setAgentPromptCopyState("copied");
      },
      () => {
        setAgentPromptCopyState("error");
      },
    );
  }, [agentPrompt]);

  const showPropsPanel = summary !== null && componentProps.length > 0;

  const isLayoutContainer =
    summary !== null &&
    (summary.computedStyle.display === "flex" || summary.computedStyle.display === "grid");
  const showAlignment = multiSelectGroup !== null && multiSelectGroup.members.length >= 2;

  const autoLayoutPanel: ReactNode | undefined =
    isLayoutContainer && summary !== null ? (
      <AutoLayoutPanel summary={summary} onCommand={handleEditorCommand} />
    ) : undefined;
  const alignmentPanel: ReactNode | undefined =
    showAlignment && multiSelectGroup !== null ? (
      <AlignmentPanel
        memberCount={multiSelectGroup.members.length}
        onCommand={handleAlignmentCommand}
      />
    ) : undefined;

  return (
    <ErrorBoundary>
      <div className={`app app--${theme}`}>
        <header className="app__header">
          <h1 className="app__title">Vision Control</h1>
          <PairingPanel
            status={connectionState}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
          <p className="app__target" data-testid="inspected-url">
            Inspecting: {url ?? "unknown"}
          </p>
        </header>
        <main className="app__main">
          <section className="app__section">
            <h2>Inspected tab</h2>
            <ul>
              <li>Tab ID: {tabId ?? "-"}</li>
              <li>Title: {title ?? "-"}</li>
              <li>URL: {url ?? "-"}</li>
            </ul>
          </section>
          <section className="app__section">
            <h2>Session</h2>
            <p data-testid="session-id">
              {session?.sessionId ?? "Waiting for background session…"}
            </p>
          </section>
          <section className="app__section">
            <h2>Frame tree</h2>
            {frames.length === 0 ? (
              <p>No frames reported yet.</p>
            ) : (
              <ul className="frame-tree">
                {frames.map((frame) => (
                  <FrameTreeItem key={frame.frameId} frame={frame} />
                ))}
              </ul>
            )}
          </section>
          <HostAllowlistPanel />
          <InspectorPanel
            summary={summary}
            onSelectElement={selectElement}
            editorMode={editor.state.mode}
            onChangeEditorMode={handleEditorModeChange}
            onEditorCommand={handleEditorCommand}
            onValidationError={editor.actions.setValidationError}
            multiSelectGroup={multiSelectGroup}
            gridPlacement={gridPlacementState?.placement ?? null}
            gridSpanCandidates={gridPlacementState?.spanCandidates ?? []}
            gridReorderChoice={gridPlacementState?.reorderChoice ?? null}
            gridA11yWarning={gridPlacementState?.a11yWarning ?? null}
            onChooseGridPlacement={handleGridChoosePlacement}
            onResizeGridSpan={handleGridResizeSpan}
            {...(alignmentPanel !== undefined ? { alignmentPanel } : {})}
            {...(autoLayoutPanel !== undefined ? { autoLayoutPanel } : {})}
          />
          {showPropsPanel && summary !== null && (
            <section className="app__section app__section--props">
              <h2>Component Props</h2>
              <PropsPanel summary={summary} props={componentProps} onCommand={handlePropCommand} />
            </section>
          )}
          <ChangeJournal
            entries={journal.entries}
            canUndo={journal.canUndo}
            canRedo={journal.canRedo}
            canCopyAgentPrompt={agentPrompt.length > 0}
            agentPromptCopyState={agentPromptCopyState}
            contextExportStatus={contextExport.status}
            pendingCount={journal.pendingCount}
            onUndo={journal.undo}
            onRedo={journal.redo}
            onClear={journal.clear}
            onCopyAgentPrompt={handleCopyAgentPrompt}
            onCopyContextJson={contextExport.onCopyJson}
            onCopyContextMarkdown={contextExport.onCopyMarkdown}
            onDownloadContextJson={contextExport.onDownloadJson}
            onDownloadContextMarkdown={contextExport.onDownloadMarkdown}
          />
        </main>
      </div>
    </ErrorBoundary>
  );
}
