import type { ReactElement } from "react";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";

import { App } from "../../src/App.js";
import { usePanelBus } from "../../src/hooks/usePanelBus.js";

function PanelRoot(): ReactElement {
  const bus = usePanelBus();

  useEffect(() => {
    if (typeof chrome === "undefined" || chrome.runtime?.connect === undefined) {
      return;
    }
    const port = chrome.runtime.connect({ name: "vision-control-panel" });
    return () => {
      port.disconnect();
    };
  }, [bus]);

  return <App />;
}

const container = document.getElementById("root");

if (container !== null) {
  const root = createRoot(container);
  root.render(<PanelRoot />);
}
