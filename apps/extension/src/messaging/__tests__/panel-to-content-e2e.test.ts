/**
 * End-to-end panel -> background -> content -> DOM verification.
 *
 * Chains the three fixed links in one test:
 *  1. The edit forwarder (background) resolves the inspected tab's routeable
 *     frame and rewrites targetRoute to "content".
 *  2. The content MessageBus accepts the forwarded message (targetRoute match).
 *  3. The content edit wiring routes it to runtime.applyOperation.
 *  4. A real DOM mutation results.
 *
 * This is the non-vacuous proof that the severed reverse path is whole again:
 * if any of the three links is broken (no-op content handler, wrong message
 * type, background not forwarding), the DOM assertion fails.
 */

import type { Operation } from "@vision-control/change-ir";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wireContentEditHandlers } from "../../overlay/content-edit-wiring.js";
import { createOverlayRuntime, type OverlayRuntime } from "../../overlay/overlay-runtime.js";
import { type BusTransport, MessageBus } from "../bus.js";
import { createEditForwarder } from "../edit-forwarding.js";
import { TabSessionStore } from "../tab-session.js";
import type { BusMessage, BusRoute, MessageContext } from "../types.js";

function installObserverMocks(): void {
  const instance = () => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  });
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
    return instance();
  }) as unknown as typeof ResizeObserver;
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.IntersectionObserver = vi.fn().mockImplementation(function () {
    return instance();
  }) as unknown as typeof IntersectionObserver;
}

function createContentBus(): {
  readonly bus: MessageBus;
  readonly deliver: (message: BusMessage) => void;
} {
  const subscribers = new Set<(message: BusMessage, sender: MessageContext) => void>();
  const transport: BusTransport = {
    route: "content" as BusRoute,
    send: () => {},
    subscribe: (handler) => {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },
  };
  const bus = new MessageBus({ route: "content", transport });
  const deliver = (message: BusMessage): void => {
    for (const handler of subscribers) {
      handler(message, { route: "background" });
    }
  };
  return { bus, deliver };
}

const BASE_TIME = 1_700_000_000_000;

describe("panel -> background -> content -> DOM end-to-end", () => {
  let runtime: OverlayRuntime | null = null;
  let bus: ReturnType<typeof createContentBus>;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn((): MediaQueryList => ({ matches: false, media: "" }) as MediaQueryList),
      configurable: true,
      writable: true,
    });
    bus = createContentBus();
    runtime = createOverlayRuntime({ document, bus: bus.bus });
    runtime.start();
    wireContentEditHandlers(bus.bus, runtime);
  });

  afterEach(() => {
    runtime?.dispose();
    runtime = null;
  });

  it("an editor-command from the panel reaches the content DOM through the forwarder", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-e2e" });
    store.ensure(42);
    store.updateFrameTree(42, [
      {
        frameId: 0,
        url: "http://localhost:3000/",
        origin: "http://localhost:3000",
        routeable: true,
      },
    ]);

    const forward = createEditForwarder({
      store,
      sendToFrame: (_tabId, _frameId, message) => bus.deliver(message),
    });

    const target = document.createElement("div");
    target.id = "e2e-target";
    target.className = "original";
    document.body.appendChild(target);
    vi.spyOn(target as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      top: 0,
      left: 0,
      right: 40,
      bottom: 20,
      toJSON: () => ({}),
    } as DOMRect);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const runtimeId = target.getAttribute("data-vc-preview-id");
    if (runtimeId === null) throw new Error("selection did not assign a preview id");

    expect(target.classList.contains("applied")).toBe(false);

    const op: Operation = {
      id: "op-e2e-001",
      timestamp: BASE_TIME,
      runtime: false,
      origin: "property-panel",
      confidence: 1,
      kind: "class-add",
      target: { runtimeId },
      className: "applied",
    };

    const panelMessage: BusMessage = {
      protocolVersion: "1.0.0",
      messageId: "mid-e2e-001",
      messageType: "editor-command",
      targetRoute: "background",
      tabId: 42,
      payload: op,
      timestamp: 1,
    };
    forward(panelMessage);

    expect(
      target.classList.contains("applied"),
      "editor-command must traverse background->content and mutate the DOM",
    ).toBe(true);
  });

  it("a clear-preview from the panel reaches the content and cleans the DOM", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-e2e-clear" });
    store.ensure(42);
    store.updateFrameTree(42, [
      {
        frameId: 0,
        url: "http://localhost:3000/",
        origin: "http://localhost:3000",
        routeable: true,
      },
    ]);
    const forward = createEditForwarder({
      store,
      sendToFrame: (_tabId, _frameId, message) => bus.deliver(message),
    });

    const target = document.createElement("div");
    target.id = "e2e-clear-target";
    document.body.appendChild(target);
    vi.spyOn(target as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      top: 0,
      left: 0,
      right: 40,
      bottom: 20,
      toJSON: () => ({}),
    } as DOMRect);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const runtimeId = target.getAttribute("data-vc-preview-id");
    if (runtimeId === null) throw new Error("selection did not assign a preview id");

    runtime?.applyOperation({
      id: "op-e2e-clear-001",
      timestamp: BASE_TIME,
      runtime: false,
      origin: "property-panel",
      confidence: 1,
      kind: "class-add",
      target: { runtimeId },
      className: "temp",
    });
    runtime?.applyOperation({
      id: "op-e2e-clear-002",
      timestamp: BASE_TIME,
      runtime: false,
      origin: "property-panel",
      confidence: 1,
      kind: "style-edit",
      target: { runtimeId },
      property: "color",
      value: "rgb(255, 0, 0)",
      important: false,
      previousValue: "black",
    });
    expect(target.classList.contains("temp")).toBe(true);
    expect(document.head.querySelector("style[data-vc-preview-stylesheet]")).not.toBeNull();

    forward({
      protocolVersion: "1.0.0",
      messageId: "mid-e2e-clear-001",
      messageType: "clear-preview",
      targetRoute: "background",
      tabId: 42,
      payload: {},
      timestamp: 1,
    });

    expect(target.classList.contains("temp")).toBe(false);
    expect(document.head.querySelector("style[data-vc-preview-stylesheet]")).toBeNull();
  });
});
