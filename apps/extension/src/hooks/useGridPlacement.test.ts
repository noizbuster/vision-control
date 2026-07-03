import { cleanup, renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { BusMessage, GridPlacementMessage, MessageContext } from "../messaging/index.js";
import { MessageBus } from "../messaging/index.js";
import { useGridPlacement } from "./useGridPlacement.js";

function createFakeBus(): {
  bus: MessageBus;
  receive: (message: BusMessage, sender?: MessageContext) => void;
} {
  let handler: ((message: BusMessage, sender: MessageContext) => void) | undefined;
  const bus = new MessageBus({
    route: "panel",
    transport: {
      route: "background",
      send: () => {},
      subscribe: (h) => {
        handler = h;
        return () => {
          handler = undefined;
        };
      },
    },
  });
  const receive = (message: BusMessage, sender: MessageContext = { route: "background" }): void => {
    handler?.(message, sender);
  };
  return { bus, receive };
}

function makePlacementState(): GridPlacementMessage {
  return {
    gridContainer: { runtimeId: "grid-1", tagName: "div" },
    child: { runtimeId: "child-1", tagName: "div" },
    placement: {
      row: 1,
      column: 1,
      rowEnd: 2,
      columnEnd: 2,
      rowSpan: 1,
      columnSpan: 1,
      rect: { x: 0, y: 0, width: 100, height: 50 },
    },
    spanCandidates: [],
    reorderChoice: null,
    a11yWarning: null,
  };
}

describe("useGridPlacement", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts with no state", () => {
    const { bus } = createFakeBus();
    const { result } = renderHook(() => useGridPlacement(bus));
    expect(result.current.state).toBeNull();
  });

  it("stores the placement when a grid-placement message arrives", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useGridPlacement(bus));
    const state = makePlacementState();

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-1",
        messageType: "grid-placement",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: state,
      });
    });

    expect(result.current.state).toEqual(state);
  });

  it("returns null state when the bus is undefined", () => {
    const { result } = renderHook(() => useGridPlacement(undefined));
    expect(result.current.state).toBeNull();
  });
});
