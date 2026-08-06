import { useEffect, useState } from "react";
import type { BusMessage, GridPlacementMessage, MessageBus } from "../messaging/index.js";

function isGridPlacementPayload(payload: unknown): payload is GridPlacementMessage {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "gridContainer" in payload &&
    "child" in payload &&
    "placement" in payload &&
    "spanCandidates" in payload &&
    "reorderChoice" in payload &&
    "a11yWarning" in payload
  );
}

export function useGridPlacement(bus: MessageBus | undefined): {
  readonly state: GridPlacementMessage | null;
} {
  const [state, setState] = useState<GridPlacementMessage | null>(null);

  useEffect(() => {
    if (bus === undefined) {
      return;
    }
    return bus.on("grid-placement", (message: BusMessage) => {
      const payload = message.payload as unknown;
      if (payload === null) {
        setState(null);
        return;
      }
      if (isGridPlacementPayload(payload)) {
        setState(payload);
      }
    });
  }, [bus]);

  return { state };
}
