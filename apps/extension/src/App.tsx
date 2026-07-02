import type { ReactElement } from "react";

import { ConnectionStatus } from "./components/ConnectionStatus.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { useInspectedTab } from "./hooks/useInspectedTab.js";
import { useTheme } from "./hooks/useTheme.js";

export function App(): ReactElement {
  const { theme } = useTheme();
  const { tabId, title, url } = useInspectedTab();

  return (
    <ErrorBoundary>
      <div className={`app app--${theme}`}>
        <header className="app__header">
          <h1 className="app__title">Vision Control</h1>
          <ConnectionStatus status="disconnected" />
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
            <h2>Document summary</h2>
            <p>Document summary placeholder</p>
          </section>
        </main>
      </div>
    </ErrorBoundary>
  );
}
