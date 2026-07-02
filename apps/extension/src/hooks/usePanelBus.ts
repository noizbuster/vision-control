import { useEffect, useState } from "react";

import { createRuntimeBus, type MessageBus } from "../messaging/index.js";

let sharedPanelBus: MessageBus | undefined;

export function usePanelBus(): MessageBus | undefined {
  const [bus, setBus] = useState<MessageBus | undefined>(sharedPanelBus);

  useEffect(() => {
    if (sharedPanelBus !== undefined) {
      return;
    }
    if (typeof chrome === "undefined" || chrome.runtime?.sendMessage === undefined) {
      return;
    }
    sharedPanelBus = createRuntimeBus("panel");
    setBus(sharedPanelBus);
  }, []);

  return bus;
}
