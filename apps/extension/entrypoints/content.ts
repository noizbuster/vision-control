import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createRuntimeBus } from "../src/messaging/index.js";

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"],
  world: "ISOLATED",

  main() {
    const bus = createRuntimeBus("content");

    bus.on("select-element", (message) => {
      const payload = message.payload as { readonly selector?: string } | undefined;
      // Element selection is handled by the overlay (task 14); this stub
      // acknowledges the message so the routing layer can be tested now.
      void payload;
    });

    bus.on("edit-request", (message) => {
      const payload = message.payload as { readonly operation?: unknown } | undefined;
      // Edit application is handled by the overlay (task 14); this stub
      // acknowledges the message so the routing layer can be tested now.
      void payload;
    });

    const helloPayload = {
      url: window.location.href,
      origin: window.location.origin,
    };

    bus.send("background", {
      protocolVersion: "1.0.0",
      messageId: `frame-hello-${Date.now()}`,
      messageType: "frame-hello",
      payload: helloPayload,
      timestamp: Date.now(),
    });
  },
});

export default contentScript;
