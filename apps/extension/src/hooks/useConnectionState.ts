import { useEffect, useState } from "react";

import type { ConnectionState, MessageBus } from "../messaging/index.js";

export function useConnectionState(bus: MessageBus | undefined): ConnectionState {
  const [state, setState] = useState<ConnectionState>("disconnected");

  useEffect(() => {
    if (bus === undefined) {
      return;
    }
    return bus.on("connection-state", (message) => {
      const payload = message.payload as { readonly state: ConnectionState } | undefined;
      if (payload?.state !== undefined) {
        setState(payload.state);
      }
    });
  }, [bus]);

  return state;
}
