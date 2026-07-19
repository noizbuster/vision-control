import { useEffect, useState } from "react";

import type { BusMessage, MessageBus } from "../messaging/index.js";
import { isMoveRejectionStatus } from "../messaging/move-rejection-messages.js";

export function useMoveRejection(bus: MessageBus | undefined): string | null {
  const [rejection, setRejection] = useState<string | null>(null);

  useEffect(() => {
    if (bus === undefined) {
      setRejection(null);
      return;
    }
    return bus.on("move-rejection-status", (message: BusMessage) => {
      if (isMoveRejectionStatus(message.payload)) {
        setRejection(message.payload?.message ?? null);
      }
    });
  }, [bus]);

  return rejection;
}
