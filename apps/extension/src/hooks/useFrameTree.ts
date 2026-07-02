import { useEffect, useState } from "react";

import type { FrameInfo, MessageBus, TabSession } from "../messaging/index.js";

export function useFrameTree(
  bus: MessageBus | undefined,
  inspectedTabId: number | undefined,
): FrameInfo[] {
  const [frames, setFrames] = useState<FrameInfo[]>([]);

  useEffect(() => {
    if (bus === undefined || inspectedTabId === undefined) {
      return;
    }
    return bus.on("session-update", (message) => {
      const payload = message.payload as
        | { readonly tabId: number; readonly session: TabSession }
        | undefined;
      if (payload?.tabId === inspectedTabId) {
        setFrames([...payload.session.frameTree]);
      }
    });
  }, [bus, inspectedTabId]);

  return frames;
}
