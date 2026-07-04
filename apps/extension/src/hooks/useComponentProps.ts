import type { SelectionSummary } from "@vision-control/inspector-core";
import { useEffect, useRef, useState } from "react";
import type { BusMessage, ComponentPropEntry, MessageBus } from "../messaging/index.js";
import { createRequestComponentPropsMessage } from "../messaging/index.js";

function isComponentPropsPayload(
  payload: unknown,
): payload is { readonly elementId: string; readonly props: readonly ComponentPropEntry[] } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "elementId" in payload &&
    "props" in payload &&
    Array.isArray((payload as { props: unknown }).props)
  );
}

/**
 * Subscribe to daemon-resolved component props for the currently selected
 * element. On every selection change, fires a `request-component-props` signal
 * to the background (which forwards to the daemon source-resolver) and clears
 * stale props until the fresh response arrives.
 *
 * Stale-state guard: a late response for a superseded selection is discarded
 * by matching the response's `elementId` against the last-requested id.
 */
export function useComponentProps(
  bus: MessageBus | undefined,
  selection: SelectionSummary | null,
): { readonly componentProps: readonly ComponentPropEntry[] } {
  const [props, setProps] = useState<readonly ComponentPropEntry[]>([]);
  const requestedIdRef = useRef<string | undefined>(undefined);

  const elementId = selection?.identity.runtimeId;
  const tagName = selection?.identity.tagName;
  const sourceId = selection?.identity.sourceId;

  useEffect(() => {
    if (bus === undefined || elementId === undefined) {
      requestedIdRef.current = undefined;
      setProps([]);
      return;
    }
    if (elementId === requestedIdRef.current) {
      return;
    }
    requestedIdRef.current = elementId;
    setProps([]);
    bus.send(
      "background",
      createRequestComponentPropsMessage({
        elementId,
        tagName: tagName ?? "unknown",
        ...(sourceId !== undefined ? { sourceId } : {}),
      }),
    );
  }, [bus, elementId, tagName, sourceId]);

  useEffect(() => {
    if (bus === undefined) {
      return;
    }
    return bus.on("component-props", (message: BusMessage) => {
      const payload = message.payload as unknown;
      if (!isComponentPropsPayload(payload)) {
        return;
      }
      if (payload.elementId !== requestedIdRef.current) {
        return;
      }
      setProps(payload.props);
    });
  }, [bus]);

  return { componentProps: props };
}
