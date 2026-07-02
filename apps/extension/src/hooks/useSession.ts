import { useEffect, useState } from "react";

import type { MessageBus, TabSession } from "../messaging/index.js";

export function useSession(
  bus: MessageBus | undefined,
  inspectedTabId: number | undefined,
): TabSession | undefined {
  const [session, setSession] = useState<TabSession | undefined>(undefined);

  useEffect(() => {
    if (bus === undefined || inspectedTabId === undefined) {
      return;
    }
    return bus.on("session-update", (message) => {
      const payload = message.payload as
        | { readonly tabId: number; readonly session: TabSession }
        | undefined;
      if (payload?.tabId === inspectedTabId) {
        setSession(payload.session);
      }
    });
  }, [bus, inspectedTabId]);

  return session;
}
