import type { SelectionSummary } from "@vision-control/inspector-core";
import { useCallback, useEffect, useState } from "react";
import type { BusMessage, MessageBus, SelectionOriginsPayload } from "../messaging/index.js";
import { createSelectElementMessage } from "../messaging/panel-messages.js";

function isSelectionSummaryPayload(payload: unknown): payload is SelectionSummary {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "identity" in payload &&
    typeof payload.identity === "object" &&
    payload.identity !== null &&
    "runtimeId" in payload.identity &&
    typeof payload.identity.runtimeId === "string" &&
    payload.identity.runtimeId.length > 0 &&
    "semantic" in payload &&
    "breadcrumb" in payload
  );
}

function isSelectionOriginsPayload(payload: unknown): payload is SelectionOriginsPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "runtimeId" in payload &&
    typeof payload.runtimeId === "string" &&
    payload.runtimeId.length > 0 &&
    "origins" in payload &&
    Array.isArray(payload.origins) &&
    "originsTruncated" in payload &&
    typeof payload.originsTruncated === "boolean"
  );
}

function isSelectionRevision(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

export type SelectionOriginState =
  | { readonly status: "idle" }
  | {
      readonly status: "pending";
      readonly revision: number;
      readonly runtimeId: string;
    }
  | {
      readonly status: "ready";
      readonly revision: number;
      readonly runtimeId: string;
      readonly origins: SelectionOriginsPayload["origins"];
      readonly originsTruncated: boolean;
    };

type SelectionState = {
  readonly summary: SelectionSummary | null;
  readonly revision: number | null;
  readonly originState: SelectionOriginState;
};

const INITIAL_SELECTION_STATE: SelectionState = {
  summary: null,
  revision: null,
  originState: { status: "idle" },
};

export function useSelectionSummary(bus: MessageBus | undefined): {
  readonly summary: SelectionSummary | null;
  readonly originState: SelectionOriginState;
  readonly selectElement: (selector: string) => void;
} {
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION_STATE);

  useEffect(() => {
    if (bus === undefined) {
      return;
    }

    const unsubscribeSummary = bus.on("selection-summary", (message: BusMessage) => {
      const revision = message.selectionRevision;
      if (!isSelectionRevision(revision)) return;

      const payload = message.payload;
      if (payload === null) {
        setSelection((current) =>
          current.revision !== null && revision < current.revision
            ? current
            : INITIAL_SELECTION_STATE,
        );
        return;
      }
      if (!isSelectionSummaryPayload(payload)) return;

      const runtimeId = payload.identity.runtimeId;
      setSelection((current) => {
        if (current.revision !== null && revision < current.revision) return current;
        if (revision === current.revision) {
          if (
            current.originState.status !== "idle" &&
            current.originState.runtimeId !== runtimeId
          ) {
            return current;
          }
          return { ...current, summary: payload };
        }
        return {
          summary: payload,
          revision,
          originState: { status: "pending", revision, runtimeId },
        };
      });
    });

    const unsubscribeOrigins = bus.on("selection-origins", (message: BusMessage) => {
      const revision = message.selectionRevision;
      const payload = message.payload;
      if (!isSelectionRevision(revision)) return;

      if (payload === null) {
        setSelection((current) => {
          if (current.revision === null || revision < current.revision) return current;
          return { ...current, revision, originState: { status: "idle" } };
        });
        return;
      }
      if (!isSelectionOriginsPayload(payload)) return;

      setSelection((current) => {
        if (
          current.revision !== revision ||
          current.originState.status === "idle" ||
          current.originState.runtimeId !== payload.runtimeId
        ) {
          return current;
        }
        return {
          ...current,
          originState: {
            status: "ready",
            revision,
            runtimeId: payload.runtimeId,
            origins: payload.origins,
            originsTruncated: payload.originsTruncated,
          },
        };
      });
    });

    return () => {
      unsubscribeSummary();
      unsubscribeOrigins();
    };
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

  return {
    summary: selection.summary,
    originState: selection.originState,
    selectElement,
  };
}
