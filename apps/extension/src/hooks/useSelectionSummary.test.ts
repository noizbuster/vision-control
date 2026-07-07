import { cleanup, renderHook } from "@testing-library/react";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { BusMessage, MessageContext } from "../messaging/index.js";
import { MessageBus } from "../messaging/index.js";
import { useSelectionSummary } from "./useSelectionSummary.js";

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

function makeSummary(): SelectionSummary {
  return {
    identity: {
      runtimeId: "runtime-1",
      tagName: "button",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#submit",
    },
    breadcrumb: [
      { tagName: "body", selector: "body" },
      { tagName: "button", selector: "#submit" },
    ],
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
    classList: [{ name: "btn", source: "unknown" }],
    attributes: [{ name: "type", value: "submit" }],
    semantic: {
      tagName: "button",
      role: "button",
      name: "Submit",
      textContentPreview: "Submit",
    },
    siblingSummary: {
      count: 1,
      index: 0,
      parentTagName: "form",
    },
    parentLayout: {
      mode: "block",
      display: "block",
    },
    sourceConfidence: "high",
  };
}

describe("useSelectionSummary", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts with no summary", () => {
    const { bus } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));

    expect(result.current.summary).toBeNull();
  });

  it("updates the summary when a selection-summary message arrives", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));
    const summary = makeSummary();

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-1",
        messageType: "selection-summary",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: summary,
      });
    });

    expect(result.current.summary).toEqual(summary);
  });

  it("clears the summary when a selection-summary clear payload arrives", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));
    const summary = makeSummary();

    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-1",
        messageType: "selection-summary",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: summary,
      });
    });
    act(() => {
      receive({
        protocolVersion: "1.0.0",
        messageId: "msg-2",
        messageType: "selection-summary",
        sourceRoute: "background",
        targetRoute: "panel",
        timestamp: Date.now(),
        payload: null,
      });
    });

    expect(result.current.summary).toBeNull();
  });

  it("sends a select-element message when selectElement is called", () => {
    const { bus, messages } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));

    act(() => {
      result.current.selectElement("#submit");
    });

    expect(messages).toHaveLength(1);
    const message = messages[0] as { messageType: string; payload: unknown };
    expect(message.messageType).toBe("select-element");
    expect(message.payload).toEqual({ selector: "#submit" });
  });

  it("does not send when the bus is undefined", () => {
    const { result } = renderHook(() => useSelectionSummary(undefined));

    act(() => {
      result.current.selectElement("#submit");
    });

    expect(result.current.summary).toBeNull();
  });
});
