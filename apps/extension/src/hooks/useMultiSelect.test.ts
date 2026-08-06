import { cleanup, renderHook } from "@testing-library/react";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import { createMultiSelectGroupId } from "@vision-control/element-identity";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { BusMessage, MessageContext } from "../messaging/index.js";
import { MessageBus } from "../messaging/index.js";
import { useMultiSelect } from "./useMultiSelect.js";

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

function makeGroup(memberCount = 2): MultiSelectGroup {
  const members = Array.from({ length: memberCount }, (_, i) => ({
    runtimeId: `runtime-${i}`,
    tagName: "div",
    frameId: "main",
    frameKind: "top" as const,
    shadowKind: "light-dom" as const,
  }));
  return {
    id: createMultiSelectGroupId("grp-0001"),
    members,
    frameId: "main",
    frameKind: "top",
    shadowKind: "light-dom",
    shadowRootCompatible: true,
    commonParent: null,
    boundingRect: { x: 0, y: 0, width: 200, height: 100 },
  };
}

describe("useMultiSelect", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts with no group", () => {
    const { bus } = createFakeBus();
    const { result } = renderHook(() => useMultiSelect(bus));
    expect(result.current.group).toBeNull();
  });

  it("stores the group when a multi-select-group message arrives", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useMultiSelect(bus));
    const group = makeGroup(3);

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-1",
        messageType: "multi-select-group",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: group,
      });
    });

    expect(result.current.group).toEqual(group);
  });

  it("ignores non-group payloads", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useMultiSelect(bus));

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-2",
        messageType: "multi-select-group",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: { unrelated: true },
      });
    });

    expect(result.current.group).toBeNull();
  });

  it("clears the group when a null multi-select-group payload arrives", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useMultiSelect(bus));
    const group = makeGroup(2);

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-group",
        messageType: "multi-select-group",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: group,
      });
    });
    expect(result.current.group).toEqual(group);

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-clear",
        messageType: "multi-select-group",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: null,
      });
    });

    expect(result.current.group).toBeNull();
  });

  it("returns null group when the bus is undefined", () => {
    const { result } = renderHook(() => useMultiSelect(undefined));
    expect(result.current.group).toBeNull();
  });
});
