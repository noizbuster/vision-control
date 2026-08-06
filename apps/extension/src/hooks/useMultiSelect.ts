import type { MultiSelectGroup } from "@vision-control/editor-core";
import { useEffect, useState } from "react";
import type { BusMessage, MessageBus } from "../messaging/index.js";

function isMultiSelectGroupPayload(payload: unknown): payload is MultiSelectGroup {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    "members" in payload &&
    "boundingRect" in payload &&
    "shadowRootCompatible" in payload
  );
}

export function useMultiSelect(bus: MessageBus | undefined): {
  readonly group: MultiSelectGroup | null;
} {
  const [group, setGroup] = useState<MultiSelectGroup | null>(null);

  useEffect(() => {
    if (bus === undefined) {
      return;
    }
    return bus.on("multi-select-group", (message: BusMessage) => {
      const payload = message.payload as unknown;
      if (payload === null) {
        setGroup(null);
        return;
      }
      if (isMultiSelectGroupPayload(payload)) {
        setGroup(payload);
      }
    });
  }, [bus]);

  return { group };
}
