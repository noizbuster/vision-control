import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createRuntimeBus } from "../src/messaging/index.js";
import { wireContentEditHandlers } from "../src/overlay/content-edit-wiring.js";
import { createOverlayRuntime, isRouteableFrame } from "../src/overlay/overlay-runtime.js";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"],
  world: "ISOLATED",

  main() {
    const bus = createRuntimeBus("content");

    let editHandlers: { dispose: () => void } | null = null;
    if (isRouteableFrame(window)) {
      const runtime = createOverlayRuntime({ document, bus });
      runtime.start();
      editHandlers = wireContentEditHandlers(bus, runtime);
      window.addEventListener(
        "pagehide",
        () => {
          editHandlers?.dispose();
          runtime.dispose();
        },
        { once: true },
      );
    }

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
