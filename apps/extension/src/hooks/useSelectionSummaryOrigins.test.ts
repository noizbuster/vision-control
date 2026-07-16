import { cleanup, renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { BusMessage, MessageContext } from "../messaging/index.js";
import { MessageBus } from "../messaging/index.js";
import { createSelectionSummaryFixture } from "../testing/selection-summary-fixture.js";
import { useSelectionSummary } from "./useSelectionSummary.js";

function createFakeBus(): {
  readonly bus: MessageBus;
  readonly receive: (message: BusMessage) => void;
} {
  let handler: ((message: BusMessage, sender: MessageContext) => void) | undefined;
  const bus = new MessageBus({
    route: "panel",
    transport: {
      route: "background",
      send: () => {},
      subscribe: (next) => {
        handler = next;
        return () => (handler = undefined);
      },
    },
  });
  return {
    bus,
    receive: (message) => handler?.(message, { route: "background" }),
  };
}

function message(
  messageType: "selection-summary" | "selection-origins",
  selectionRevision: number,
  payload: unknown,
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `${messageType}-${selectionRevision}`,
    messageType,
    sourceRoute: "background",
    targetRoute: "panel",
    selectionRevision,
    timestamp: 1_700_000_000_000,
    payload,
  };
}

describe("useSelectionSummary origins", () => {
  afterEach(cleanup);

  it("moves from idle to pending to ready for matching revision and runtimeId", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));

    expect(result.current.originState).toEqual({ status: "idle" });
    act(() => receive(message("selection-summary", 1, createSelectionSummaryFixture())));
    expect(result.current.originState).toEqual({
      status: "pending",
      revision: 1,
      runtimeId: "runtime-1",
    });
    act(() =>
      receive(
        message("selection-origins", 1, {
          runtimeId: "runtime-1",
          origins: [{ relativePath: "src/Button.tsx", confidence: "high", warnings: [] }],
          originsTruncated: true,
        }),
      ),
    );

    expect(result.current.originState).toEqual({
      status: "ready",
      revision: 1,
      runtimeId: "runtime-1",
      origins: [{ relativePath: "src/Button.tsx", confidence: "high", warnings: [] }],
      originsTruncated: true,
    });
  });

  it.each([
    ["revision", 2, "runtime-1"],
    ["runtimeId", 1, "runtime-2"],
  ])("ignores origins with a mismatching %s", (_field, revision, runtimeId) => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));
    act(() => receive(message("selection-summary", 1, createSelectionSummaryFixture())));

    act(() =>
      receive(
        message("selection-origins", revision, {
          runtimeId,
          origins: [],
          originsTruncated: false,
        }),
      ),
    );

    expect(result.current.originState.status).toBe("pending");
  });

  it("keeps ready origins when an equal-revision breakpoint summary arrives", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));
    const summary = createSelectionSummaryFixture();
    act(() => receive(message("selection-summary", 4, summary)));
    act(() =>
      receive(
        message("selection-origins", 4, {
          runtimeId: "runtime-1",
          origins: [],
          originsTruncated: false,
        }),
      ),
    );

    act(() => receive(message("selection-summary", 4, { ...summary, activeBreakpoint: "xl" })));

    expect(result.current.summary?.activeBreakpoint).toBe("xl");
    expect(result.current.originState.status).toBe("ready");
  });

  it("returns to pending on same-element reselection and ignores the old completion", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));
    act(() => receive(message("selection-summary", 1, createSelectionSummaryFixture())));
    act(() => receive(message("selection-summary", 2, createSelectionSummaryFixture())));
    act(() =>
      receive(
        message("selection-origins", 1, {
          runtimeId: "runtime-1",
          origins: [],
          originsTruncated: false,
        }),
      ),
    );

    expect(result.current.originState).toEqual({
      status: "pending",
      revision: 2,
      runtimeId: "runtime-1",
    });
  });

  it("clears summary and origins on a current clear revision", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));
    act(() => receive(message("selection-summary", 1, createSelectionSummaryFixture())));

    act(() => receive(message("selection-summary", 2, null)));

    expect(result.current.summary).toBeNull();
    expect(result.current.originState).toEqual({ status: "idle" });
  });

  it("invalidates origins without clearing the displayed summary", () => {
    const { bus, receive } = createFakeBus();
    const { result } = renderHook(() => useSelectionSummary(bus));
    act(() => receive(message("selection-summary", 1, createSelectionSummaryFixture())));
    act(() =>
      receive(
        message("selection-origins", 1, {
          runtimeId: "runtime-1",
          origins: [],
          originsTruncated: false,
        }),
      ),
    );

    act(() => receive(message("selection-origins", 2, null)));

    expect(result.current.summary?.identity.runtimeId).toBe("runtime-1");
    expect(result.current.originState).toEqual({ status: "idle" });
  });
});
