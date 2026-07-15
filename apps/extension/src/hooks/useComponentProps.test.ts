import { cleanup, renderHook } from "@testing-library/react";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { afterEach, describe, expect, it } from "vitest";
import { MessageBus } from "../messaging/index.js";
import { useComponentProps } from "./useComponentProps.js";

function createFakeBus(): MessageBus {
  return new MessageBus({
    route: "panel",
    transport: {
      route: "background",
      send: () => {},
      subscribe: () => () => {},
    },
  });
}

afterEach(() => {
  cleanup();
});

describe("useComponentProps (product path dropped)", () => {
  it("always returns empty props when selection is null", () => {
    const { result } = renderHook(() => useComponentProps(createFakeBus(), null));
    expect(result.current.componentProps).toEqual([]);
  });

  it("always returns empty props when bus is undefined", () => {
    const { result } = renderHook(() => useComponentProps(undefined, null));
    expect(result.current.componentProps).toEqual([]);
  });

  it("never requests daemon component-props for a selection", () => {
    const messages: unknown[] = [];
    const bus = new MessageBus({
      route: "panel",
      transport: {
        route: "background",
        send: (_route, message) => {
          messages.push(message);
        },
        subscribe: () => () => {},
      },
    });
    const selection = { identity: { runtimeId: "el-1" } } as SelectionSummary;
    const { result } = renderHook(() => useComponentProps(bus, selection));
    expect(result.current.componentProps).toEqual([]);
    expect(messages).toEqual([]);
  });
});
