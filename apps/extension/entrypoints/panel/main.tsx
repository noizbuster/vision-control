import { createRoot } from "react-dom/client";

import { App } from "../../src/App.js";

const container = document.getElementById("root");

if (container !== null) {
  const root = createRoot(container);
  root.render(<App />);
}
