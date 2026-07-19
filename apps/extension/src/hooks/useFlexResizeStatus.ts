import { useEffect, useState } from "react";

import type { BusMessage, MessageBus } from "../messaging/index.js";
import { type FlexResizeStatus, isFlexResizeStatus } from "../messaging/resize-messages.js";

export function useFlexResizeStatus(bus: MessageBus | undefined): FlexResizeStatus | null {
  const [status, setStatus] = useState<FlexResizeStatus | null>(null);

  useEffect(() => {
    if (bus === undefined) {
      setStatus(null);
      return;
    }
    return bus.on("flex-resize-status", (message: BusMessage) => {
      if (isFlexResizeStatus(message.payload)) {
        setStatus(message.payload);
      }
    });
  }, [bus]);

  return status;
}
