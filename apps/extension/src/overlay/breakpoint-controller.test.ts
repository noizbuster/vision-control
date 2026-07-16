import { afterEach, describe, expect, it, vi } from "vitest";

import type { BusMessage, BusRoute } from "../messaging/types.js";
import { createSelectionSummaryFixture } from "../testing/selection-summary-fixture.js";
import { createBreakpointController } from "./breakpoint-controller.js";

function installMatchMedia(width: number): { readonly setWidth: (next: number) => void } {
  let currentWidth = width;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => {
      const match = /\(min-width:\s*(\d+)px\)/.exec(query);
      const threshold = Number.parseInt(match?.[1] ?? "99999", 10);
      return {
        matches: currentWidth >= threshold,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as MediaQueryList;
    },
  });
  return { setWidth: (next) => (currentWidth = next) };
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("breakpoint controller selection revision", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retains the selection revision when a resize republishes the summary", async () => {
    const media = installMatchMedia(500);
    const sent: { readonly route: BusRoute; readonly message: BusMessage }[] = [];
    const controller = createBreakpointController({
      window,
      bus: {
        send: (route, message) => sent.push({ route, message }),
        on: () => () => {},
      },
    });
    controller.attach();

    controller.onSelection(createSelectionSummaryFixture(), 7);
    media.setWidth(1300);
    window.dispatchEvent(new Event("resize"));
    await flushRaf();

    expect(sent.map((entry) => entry.message.selectionRevision)).toEqual([7, 7]);
    controller.dispose();
  });

  it("publishes a clear with its invalidating revision", () => {
    installMatchMedia(500);
    const sent: BusMessage[] = [];
    const controller = createBreakpointController({
      window,
      bus: {
        send: (_route, message) => sent.push(message),
        on: () => () => {},
      },
    });

    controller.clear(8);

    expect(sent[0]?.payload).toBeNull();
    expect(sent[0]?.selectionRevision).toBe(8);
  });

  it("retains the selection revision when screens refresh the active breakpoint", () => {
    installMatchMedia(1300);
    const sent: BusMessage[] = [];
    let screensHandler: ((message: BusMessage) => void) | undefined;
    const controller = createBreakpointController({
      window,
      bus: {
        send: (_route, message) => sent.push(message),
        on: (_messageType, handler) => {
          screensHandler = handler;
          return () => {
            screensHandler = undefined;
          };
        },
      },
    });
    controller.attach();
    controller.onSelection(createSelectionSummaryFixture(), 9);

    screensHandler?.({
      protocolVersion: "1.0.0",
      messageId: "viewport-screens-1",
      messageType: "viewport-screens",
      payload: { screens: ["sm", "md"] },
      timestamp: 1_700_000_000_000,
    });

    expect(sent.map((message) => message.selectionRevision)).toEqual([9, 9]);
    expect(
      sent.map(
        (message) => (message.payload as { readonly activeBreakpoint?: string }).activeBreakpoint,
      ),
    ).toEqual(["xl", "md"]);
    controller.dispose();
  });
});
