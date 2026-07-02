import type { ReactElement } from "react";
import { ConnectionStatus } from "./components/ConnectionStatus.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { InspectorPanel } from "./components/inspector/InspectorPanel.js";
import { ChangeJournal } from "./components/journal/ChangeJournal.js";
import { useConnectionState } from "./hooks/useConnectionState.js";
import { useEditor } from "./hooks/useEditor.js";
import { useFrameTree } from "./hooks/useFrameTree.js";
import { useInspectedTab } from "./hooks/useInspectedTab.js";
import { useJournal } from "./hooks/useJournal.js";
import { useJournalPersistence } from "./hooks/useJournalPersistence.js";
import { usePanelBus } from "./hooks/usePanelBus.js";
import { useSelectionSummary } from "./hooks/useSelectionSummary.js";
import { useSession } from "./hooks/useSession.js";
import { useTheme } from "./hooks/useTheme.js";
import type { FrameInfo } from "./messaging/index.js";
import { createEditorCommandMessage } from "./messaging/index.js";
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
  const editor = useEditor();
  const journal = useJournal({ connectionState });
  useJournalPersistence({
    journal: journal.journal,
    client: null,
    onRestore: journal.replaceJournal,
  });

  const handleEditorCommand = (command: Parameters<typeof createEditorCommandMessage>[0]): void => {
    editor.actions.addPendingOperation(command);
    journal.record(command);
    if (bus !== undefined) {
      bus.send("background", createEditorCommandMessage(command));
    }
  };

  return (
    <ErrorBoundary>
      <div className={`app app--${theme}`}>
        <header className="app__header">
          <h1 className="app__title">Vision Control</h1>
          <ConnectionStatus status={connectionState} />
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
          <InspectorPanel
            summary={summary}
            onSelectElement={selectElement}
            editorMode={editor.state.mode}
            onChangeEditorMode={editor.actions.setMode}
            onEditorCommand={handleEditorCommand}
            onValidationError={editor.actions.setValidationError}
          />
          <ChangeJournal
            entries={journal.entries}
            canUndo={journal.canUndo}
            canRedo={journal.canRedo}
            pendingCount={journal.pendingCount}
            onUndo={journal.undo}
            onRedo={journal.redo}
            onClear={journal.clear}
          />
        </main>
      </div>
    </ErrorBoundary>
  );
}
