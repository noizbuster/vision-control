import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { InspectorEditorSlots } from "./components/inspector/InspectorEditorSlots.js";
import { buildAgentPrompt } from "./components/journal/agent-prompt.js";
import { ChangeJournal } from "./components/journal/ChangeJournal.js";
import { PairingPanel } from "./components/PairingPanel.js";
import { PanelDiagnostics } from "./components/PanelDiagnostics.js";
import { useComponentProps } from "./hooks/useComponentProps.js";
import { useConnectionState } from "./hooks/useConnectionState.js";
import { useContextExport } from "./hooks/useContextExport.js";
import type { EditorMode } from "./hooks/useEditor.js";
import { useEditor } from "./hooks/useEditor.js";
import { useFlexResizeStatus } from "./hooks/useFlexResizeStatus.js";
import { useFrameTree } from "./hooks/useFrameTree.js";
import { useGridPlacement } from "./hooks/useGridPlacement.js";
import { useInspectedTab } from "./hooks/useInspectedTab.js";
import { useJournal } from "./hooks/useJournal.js";
import { useJournalPersistence } from "./hooks/useJournalPersistence.js";
import { useMoveRejection } from "./hooks/useMoveRejection.js";
import { useMultiSelect } from "./hooks/useMultiSelect.js";
import { usePanelBus } from "./hooks/usePanelBus.js";
import { useSelectionCopyContext } from "./hooks/useSelectionCopyContext.js";
import { useSelectionSummary } from "./hooks/useSelectionSummary.js";
import { useSession } from "./hooks/useSession.js";
import { useTheme } from "./hooks/useTheme.js";
import {
  isPanelInteractionMode,
  sendInteractionModeToRouteableFrames,
} from "./interaction-mode-routing.js";
import {
  createBridgeConnectMessage,
  createBridgeDisconnectMessage,
  createClearPreviewMessage,
  createEditorCommandMessage,
  subscribePanelOperations,
} from "./messaging/index.js";
import "./styles/variables.css";
import "./styles/panel-shell.css";
import "./styles/inspector.css";
import "./styles/flex-resize-status.css";
import "./styles/journal.css";

export function App(): ReactElement {
  const { theme } = useTheme();
  const { tabId, title, url } = useInspectedTab();
  const bus = usePanelBus();
  const connectionState = useConnectionState(bus);
  const session = useSession(bus, tabId);
  const frames = useFrameTree(bus, tabId);
  const { summary, originState, selectElement, resetSelection } = useSelectionSummary(bus);
  const { group: multiSelectGroup } = useMultiSelect(bus);
  const { state: gridPlacementState } = useGridPlacement(bus);
  const { componentProps } = useComponentProps(bus, summary);
  const flexResizeStatus = useFlexResizeStatus(bus);
  const moveRejection = useMoveRejection(bus);
  const editor = useEditor();
  const routedInteractionMode = isPanelInteractionMode(editor.state.mode)
    ? editor.state.mode
    : null;
  const routeableFrameKey = frames
    .filter((frame) => frame.routeable)
    .map((frame) => frame.frameId)
    .join(",");
  const lastInteractionRouteRef = useRef<string | null>(null);
  const setEditorMode = editor.actions.setMode;
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
        journal: journal.journal,
      }),
    [url, summary, journal.journal],
  );
  const { canCopySelectionContext, selectionCopyStatus, handleCopySelectionContext } =
    useSelectionCopyContext({
      summary,
      originState,
      pageUrl: url,
    });
  const recordRemoteRef = useRef(journal.recordRemote);
  recordRemoteRef.current = journal.recordRemote;
  useEffect(() => {
    if (bus === undefined || tabId === undefined || tabId === null) return;
    return subscribePanelOperations({
      bus,
      tabId,
      record: (operation) => recordRemoteRef.current(operation),
    });
  }, [bus, tabId]);
  useJournalPersistence({
    journal: journal.journal,
    tabId,
    bus,
    onRestore: journal.replaceJournal,
  });
  useEffect(() => {
    setAgentPromptCopyState("idle");
  }, [agentPrompt]);
  // Safety net: full navigations should clear via content dispose, but SPA
  // transitions and missed pagehide deliveries can leave a sticky summary whose
  // revision blocks every post-nav select. Reset when the inspected page identity
  // changes so the next selection-summary always wins.
  const inspectedPageKey = `${tabId ?? "none"}:${url ?? ""}`;
  const lastInspectedPageKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastInspectedPageKeyRef.current === null) {
      lastInspectedPageKeyRef.current = inspectedPageKey;
      return;
    }
    if (lastInspectedPageKeyRef.current === inspectedPageKey) return;
    lastInspectedPageKeyRef.current = inspectedPageKey;
    resetSelection();
  }, [inspectedPageKey, resetSelection]);
  useEffect(() => {
    if (bus === undefined || tabId === undefined || tabId === null) return;
    const routeKey = `${tabId}:${routedInteractionMode ?? "none"}:${routeableFrameKey}`;
    if (lastInteractionRouteRef.current === routeKey) return;
    lastInteractionRouteRef.current = routeKey;
    sendInteractionModeToRouteableFrames(bus, tabId, frames, routedInteractionMode);
  }, [bus, frames, routeableFrameKey, routedInteractionMode, tabId]);

  useEffect(() => {
    if (bus === undefined) return;
    return bus.on("interaction-mode-cleared", (message) => {
      if (message.payload === null) {
        setEditorMode(null);
      }
    });
  }, [bus, setEditorMode]);

  const handleEditorCommand = (command: Parameters<typeof createEditorCommandMessage>[0]): void => {
    editor.actions.addPendingOperation(command);
    journal.record(command);
    if (bus !== undefined) {
      bus.send("background", createEditorCommandMessage(command, tabId ?? undefined));
    }
  };

  const handleEditorModeChange = (mode: EditorMode): void => {
    editor.actions.setMode(mode);
  };

  const handleConnect = (pairingUrl: string): void => {
    if (bus !== undefined) {
      bus.send("background", createBridgeConnectMessage(pairingUrl, tabId ?? undefined));
    }
  };

  const handleDisconnect = (): void => {
    if (bus !== undefined) {
      bus.send("background", createBridgeDisconnectMessage(tabId ?? undefined));
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

  return (
    <ErrorBoundary>
      <div className={`app app--${theme}`} data-testid="panel-shell">
        <header className="app__header">
          <div className="app__title-row">
            <h1 className="app__title">Vision Control</h1>
          </div>
          <p className="app__target" data-testid="inspected-url">
            Inspecting: {url ?? "unknown"}
          </p>
          <details className="app__pairing" data-testid="pairing-drawer">
            <summary>Agent / MCP pairing (optional)</summary>
            <div className="app__pairing-body">
              <PairingPanel
                status={connectionState}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            </div>
          </details>
        </header>
        <main className="app__main">
          <div className="app__scroll">
            <PanelDiagnostics
              diagnostics={{
                tabId,
                title,
                url,
                sessionId: session?.sessionId,
                frames,
              }}
            />
            <div className="app__primary">
              <InspectorEditorSlots
                summary={summary}
                onSelectElement={selectElement}
                editorMode={editor.state.mode}
                onChangeEditorMode={handleEditorModeChange}
                onEditorCommand={handleEditorCommand}
                onValidationError={editor.actions.setValidationError}
                multiSelectGroup={multiSelectGroup}
                gridPlacementState={gridPlacementState}
                canCopySelectionContext={canCopySelectionContext}
                onCopySelectionContext={handleCopySelectionContext}
                selectionCopyStatus={selectionCopyStatus}
                componentProps={componentProps}
                flexResizeStatus={flexResizeStatus}
                moveRejection={moveRejection}
              />
            </div>
          </div>
          <div className="app__journal" data-testid="journal-strip">
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
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
