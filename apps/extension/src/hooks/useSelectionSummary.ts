import type { SelectionSummary } from "@vision-control/inspector-core";
import { useCallback, useEffect, useState } from "react";
import type { BusMessage, MessageBus } from "../messaging/index.js";
import { createSelectElementMessage } from "../messaging/panel-messages.js";

function isSelectionSummaryPayload(payload: unknown): payload is SelectionSummary {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "identity" in payload &&
    "semantic" in payload &&
    "breadcrumb" in payload
  );
}

export function useSelectionSummary(bus: MessageBus | undefined): {
  readonly summary: SelectionSummary | null;
  readonly selectElement: (selector: string) => void;
} {
  const [summary, setSummary] = useState<SelectionSummary | null>(null);

  useEffect(() => {
    if (bus === undefined) {
      return;
    }
    return bus.on("selection-summary", (message: BusMessage) => {
      const payload = message.payload as unknown;
      if (isSelectionSummaryPayload(payload)) {
        setSummary(payload as SelectionSummary);
      }
    });
  }, [bus]);

  const selectElement = useCallback(
    (selector: string): void => {
      if (bus === undefined) {
        return;
      }
      bus.send("background", createSelectElementMessage(selector));
    },
    [bus],
  );

  return { summary, selectElement };
}
