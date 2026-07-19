import type { ReactElement } from "react";

import type { FrameInfo } from "../messaging/index.js";
import { HostAllowlistPanel } from "./HostAllowlistPanel.js";

interface PanelDiagnosticsData {
  readonly tabId: number | null | undefined;
  readonly title: string | null | undefined;
  readonly url: string | null | undefined;
  readonly sessionId: string | undefined;
  readonly frames: readonly FrameInfo[];
}

interface PanelDiagnosticsProps {
  readonly diagnostics: PanelDiagnosticsData;
}

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

export function PanelDiagnostics({ diagnostics }: PanelDiagnosticsProps): ReactElement {
  const { tabId, title, url, sessionId, frames } = diagnostics;
  return (
    <details className="app__diagnostics" data-testid="diagnostics-drawer">
      <summary>Diagnostics</summary>
      <div className="app__diagnostics-body">
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
          <p data-testid="session-id">{sessionId ?? "Waiting for background session…"}</p>
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
      </div>
    </details>
  );
}
