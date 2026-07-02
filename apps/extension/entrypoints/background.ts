import type { BackgroundDefinition } from "wxt";
import { defineBackground } from "wxt/utils/define-background";

const background: BackgroundDefinition = defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details) => {
    console.log("Vision Control installed:", details.reason);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Routing stub: real message bus lands in task 11.
    sendResponse({
      ok: true,
      stub: true,
      message,
      sender: {
        tabId: sender.tab?.id,
        frameId: sender.frameId,
      },
    });
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    // Long-lived connection stub: real lifecycle management lands in task 11.
    port.onMessage.addListener((message) => {
      port.postMessage({ ok: true, stub: true, echo: message });
    });
  });
});

export default background;
