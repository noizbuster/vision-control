import { cleanup, renderHook } from "@testing-library/react";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { BusMessage, ComponentPropEntry, MessageContext } from "../messaging/index.js";
import { MessageBus } from "../messaging/index.js";
import { useComponentProps } from "./useComponentProps.js";

function createFakeBus(): {
  bus: MessageBus;
  messages: unknown[];
  receive: (message: BusMessage, sender?: MessageContext) => void;
} {
  const messages: unknown[] = [];
  let handler: ((message: BusMessage, sender: MessageContext) => void) | undefined;

  const bus = new MessageBus({
    route: "panel",
    transport: {
      route: "background",
      send: (_route, message) => {
        messages.push(message);
      },
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

  return { bus, messages, receive };
}

function makeSummary(runtimeId: string, sourceId?: string): SelectionSummary {
  return {
    identity: {
      runtimeId,
      tagName: "button",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#submit",
      ...(sourceId !== undefined ? { sourceId } : {}),
    },
    breadcrumb: [{ tagName: "body", selector: "body" }],
    computedStyle: {
      display: "inline-block",
      position: "static",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      flexBasis: "auto",
      flexGrow: "0",
      width: "auto",
      height: "auto",
      padding: "0px",
      margin: "0px",
      border: "0px none rgb(0, 0, 0)",
      color: "rgb(0, 0, 0)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "normal",
    },
    boxModel: {
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      content: { width: 100, height: 40 },
      position: { x: 0, y: 0 },
    },
    classList: [],
    attributes: [],
    semantic: { tagName: "button", textContentPreview: "Submit" },
    siblingSummary: { count: 1, index: 0, parentTagName: "form" },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
  };
}

function makePropEntry(name: string, value: string): ComponentPropEntry {
  return {
    name,
    value,
    kind: "component-prop",
    componentName: "Button",
    sourceRange: { startLine: 5, startColumn: 10, endLine: 5, endColumn: 18 },
    ownershipContext: "same-component",
  };
}

function componentPropsMessage(
  elementId: string,
  props: readonly ComponentPropEntry[],
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `component-props-${Date.now()}`,
    messageType: "component-props",
    sourceRoute: "background",
    targetRoute: "panel",
    timestamp: Date.now(),
    payload: { elementId, props },
  };
}

describe("useComponentProps", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts with empty props", () => {
    const { bus } = createFakeBus();
    const { result } = renderHook(() => useComponentProps(bus, null));
    expect(result.current.componentProps).toEqual([]);
  });

  it("returns empty props when the bus is undefined", () => {
    const { result } = renderHook(() => useComponentProps(undefined, null));
    expect(result.current.componentProps).toEqual([]);
  });

  it("fires a request-component-props message when a selection arrives", () => {
    const { bus, messages } = createFakeBus();
    const summary = makeSummary("btn-1", "marker-btn-1");

    renderHook(() => useComponentProps(bus, summary));

    expect(messages).toHaveLength(1);
    const msg = messages[0] as { messageType: string; payload: Record<string, unknown> };
    expect(msg.messageType).toBe("request-component-props");
    expect(msg.payload.elementId).toBe("btn-1");
    expect(msg.payload.sourceId).toBe("marker-btn-1");
  });

  it("stores props when a component-props response arrives for the selected element", () => {
    const { bus, receive } = createFakeBus();
    const summary = makeSummary("btn-1");
    const { result } = renderHook(() => useComponentProps(bus, summary));

    const props = [makePropEntry("variant", "primary"), makePropEntry("size", "md")];
    act(() => {
      receive(componentPropsMessage("btn-1", props));
    });

    expect(result.current.componentProps).toHaveLength(2);
    expect(result.current.componentProps[0]?.name).toBe("variant");
  });

  it("discards a stale response from a superseded selection (adversarial: stale_state)", () => {
    const { bus, receive } = createFakeBus();
    type HookProps = { selection: SelectionSummary | null };
    const initialProps: HookProps = { selection: makeSummary("btn-a") };
    const summaryB = makeSummary("btn-b");
    const { result, rerender } = renderHook(
      ({ selection }: HookProps) => useComponentProps(bus, selection),
      { initialProps },
    );

    const propsA = [makePropEntry("variant", "primary")];
    act(() => {
      receive(componentPropsMessage("btn-a", propsA));
    });
    expect(result.current.componentProps).toHaveLength(1);

    rerender({ selection: summaryB });

    expect(result.current.componentProps).toEqual([]);

    const staleResponseForA = componentPropsMessage("btn-a", propsA);
    act(() => {
      receive(staleResponseForA);
    });

    expect(result.current.componentProps).toEqual([]);
  });

  it("clears props when the selection becomes null", () => {
    const { bus, receive } = createFakeBus();
    type HookProps = { selection: SelectionSummary | null };
    const initialProps: HookProps = { selection: makeSummary("btn-1") };
    const { result, rerender } = renderHook(
      ({ selection }: HookProps) => useComponentProps(bus, selection),
      { initialProps },
    );

    act(() => {
      receive(componentPropsMessage("btn-1", [makePropEntry("variant", "primary")]));
    });
    expect(result.current.componentProps).toHaveLength(1);

    rerender({ selection: null });

    expect(result.current.componentProps).toEqual([]);
  });

  it("ignores non-component-props payloads on the component-props channel", () => {
    const { bus, receive } = createFakeBus();
    const summary = makeSummary("btn-1");
    const { result } = renderHook(() => useComponentProps(bus, summary));

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-bad",
        messageType: "component-props",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: { unrelated: true },
      });
    });

    expect(result.current.componentProps).toEqual([]);
  });
});
