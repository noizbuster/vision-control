import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";

const contentScript: ContentScriptDefinition = defineContentScript({
  // Vision Control only operates on the loopback daemon.
  matches: ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"],
  world: "ISOLATED",

  main() {
    // Bridge stub: real content-script message bridge lands in task 11.
    // The overlay (task 14) is responsible for hit-testing; this script
    // intentionally does not participate in selection/pointer handling.
    const channel = new BroadcastChannel("vision-control-content-stub");
    channel.onmessage = (event) => {
      channel.postMessage({ ok: true, stub: true, echo: event.data });
    };
  },
});

export default contentScript;
