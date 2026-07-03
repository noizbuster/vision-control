import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createRuntimeBus } from "../src/messaging/index.js";
import { createOverlayRuntime, isRouteableFrame } from "../src/overlay/overlay-runtime.js";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"],
  world: "ISOLATED",

  main() {
    const bus = createRuntimeBus("content");

    if (isRouteableFrame(window)) {
      const runtime = createOverlayRuntime({ document, bus });
      runtime.start();
      window.addEventListener("pagehide", () => runtime.dispose(), { once: true });
    }

    bus.on("edit-request", (message) => {
      const payload = message.payload as { readonly operation?: unknown } | undefined;
      // Edit application is owned by the interaction controllers (task 19+);
      // the overlay runtime (task 18) owns pick/select only.
      void payload;
    });

    bus.send("background", {
      protocolVersion: "1.0.0",
      messageId: `frame-hello-${Date.now()}`,
      messageType: "frame-hello",
      payload: {
        url: window.location.href,
        origin: window.location.origin,
      },
      timestamp: Date.now(),
    });
  },
});

export default contentScript;
