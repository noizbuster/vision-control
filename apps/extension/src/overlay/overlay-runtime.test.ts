import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BusMessage, BusMessageHandler, BusRoute } from "../messaging/index.js";
import {
  createOverlayRuntime,
  isInsideClosedShadowRoot,
  isRouteableFrame,
  type OverlayRuntime,
  type OverlayRuntimeBus,
} from "./overlay-runtime.js";

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

function installObserverMocks(): void {
  const observerInstance = () => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  });
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
    return observerInstance();
  }) as unknown as typeof ResizeObserver;
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.IntersectionObserver = vi.fn().mockImplementation(function () {
    return observerInstance();
  }) as unknown as typeof IntersectionObserver;
}

function setRect(element: Element, rect: Rect): void {
  vi.spyOn(element as HTMLElement, "getBoundingClientRect").mockReturnValue({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => ({}),
  } as DOMRect);
}

function createFakeBus(): OverlayRuntimeBus & {
  readonly sent: ReadonlyArray<{ readonly route: BusRoute; readonly message: BusMessage }>;
  emit(messageType: string, payload: unknown): void;
} {
  const sent: Array<{ readonly route: BusRoute; readonly message: BusMessage }> = [];
  const handlers = new Map<string, Set<BusMessageHandler>>();

  const send: OverlayRuntimeBus["send"] = (route, message) => {
    sent.push({
      route,
      message: {
        ...message,
        sourceRoute: "content",
        targetRoute: route,
      } as BusMessage,
    });
  };
  const on: OverlayRuntimeBus["on"] = (messageType, handler) => {
    let set = handlers.get(messageType);
    if (set === undefined) {
      set = new Set();
      handlers.set(messageType, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  };
  const emit = (messageType: string, payload: unknown): void => {
    const message = {
      protocolVersion: "1.0.0",
      messageId: `test-${messageType}-${sent.length}`,
      messageType,
      sourceRoute: "panel",
      targetRoute: "content",
      payload,
      timestamp: Date.now(),
    } as BusMessage;
    for (const handler of handlers.get(messageType) ?? []) {
      handler(message, { route: "panel" });
    }
  };

  return { send, on, sent, emit };
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function readOutlineStyle(shadowRoot: ShadowRoot, className: string): CSSStyleDeclaration {
  const el = shadowRoot.querySelector(className);
  if (el === null) {
    throw new Error(`overlay element ${className} not found in shadow root`);
  }
  return (el as HTMLElement).style;
}

function selectionSummaryMessages(bus: ReturnType<typeof createFakeBus>): readonly BusMessage[] {
  return bus.sent
    .filter((entry) => entry.message.messageType === "selection-summary")
    .map((entry) => entry.message);
}

describe("overlay runtime", () => {
  let runtime: OverlayRuntime | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
  });

  afterEach(() => {
    runtime?.dispose();
    runtime = null;
  });

  it("draws a hover outline in the shadow root when the pointer moves over an element", async () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();

    const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement;
    const shadowRoot = host.shadowRoot as ShadowRoot;

    const button = document.createElement("button");
    button.textContent = "Save";
    document.body.appendChild(button);
    setRect(button, { x: 30, y: 40, width: 120, height: 36 });

    button.dispatchEvent(new MouseEvent("mousemove", { bubbles: false }));
    await flushRaf();

    const hoverStyle = readOutlineStyle(shadowRoot, ".vc-hover-outline");
    expect(hoverStyle.display).toBe("block");
    expect(hoverStyle.left).toBe("30px");
    expect(hoverStyle.top).toBe("40px");

    runtime.stop();
  });

  it("selects the clicked element and routes a selection-summary to the panel", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();

    const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement;
    const shadowRoot = host.shadowRoot as ShadowRoot;

    const button = document.createElement("button");
    button.id = "save";
    button.textContent = "Save";
    document.body.appendChild(button);
    setRect(button, { x: 10, y: 20, width: 100, height: 40 });

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const selectStyle = readOutlineStyle(shadowRoot, ".vc-select-outline");
    expect(selectStyle.display).toBe("block");
    expect(selectStyle.left).toBe("10px");
    expect(selectStyle.top).toBe("20px");

    const summaries = selectionSummaryMessages(bus);
    expect(summaries).toHaveLength(1);
    expect((summaries[0]?.payload as { identity: { tagName: string } }).identity.tagName).toBe(
      "button",
    );
  });

  it("keeps the selection outline attached to the element after scroll (AC-001)", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();

    const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement;
    const shadowRoot = host.shadowRoot as ShadowRoot;

    const target = document.createElement("div");
    target.id = "tracked";
    document.body.appendChild(target);
    setRect(target, { x: 5, y: 10, width: 80, height: 25 });

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(readOutlineStyle(shadowRoot, ".vc-select-outline").top).toBe("10px");

    // Simulate the element shifting because the page scrolled. The position
    // observer (window scroll listener) must drive a re-render.
    setRect(target, { x: 5, y: 77, width: 80, height: 25 });
    window.dispatchEvent(new Event("scroll"));

    expect(readOutlineStyle(shadowRoot, ".vc-select-outline").top).toBe("77px");
  });

  it("re-selects an element when the panel sends a select-element message", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();

    const target = document.createElement("button");
    target.id = "reselect";
    document.body.appendChild(target);
    setRect(target, { x: 0, y: 0, width: 50, height: 50 });

    bus.emit("select-element", { selector: "#reselect" });

    expect(selectionSummaryMessages(bus)).toHaveLength(1);
  });

  it("does not select an element inside a closed shadow root (PRD §23.5)", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();

    const host = document.createElement("div");
    host.id = "closed-host";
    const closedRoot = host.attachShadow({ mode: "closed" });
    const inner = document.createElement("button");
    closedRoot.appendChild(inner);
    document.body.appendChild(host);

    expect(isInsideClosedShadowRoot(inner)).toBe(true);

    inner.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(selectionSummaryMessages(bus)).toHaveLength(0);
  });

  it("ignores pointer targets that belong to its own overlay host", async () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();

    const host = document.querySelector("[data-vc-overlay-host]") as HTMLElement;
    const shadowRoot = host.shadowRoot as ShadowRoot;

    host.dispatchEvent(new MouseEvent("mousemove", { bubbles: false }));
    await flushRaf();

    expect(readOutlineStyle(shadowRoot, ".vc-hover-outline").display).toBe("none");
  });

  it("stop() removes DOM listeners and deactivates inspect mode", async () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();

    const button = document.createElement("button");
    document.body.appendChild(button);
    setRect(button, { x: 1, y: 2, width: 3, height: 4 });

    runtime.stop();

    button.dispatchEvent(new MouseEvent("mousemove", { bubbles: false }));
    await flushRaf();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(selectionSummaryMessages(bus)).toHaveLength(0);
  });
});

describe("isRouteableFrame", () => {
  it("returns true for the top frame", () => {
    const top = {} as Window;
    Object.defineProperty(top, "self", { value: top });
    Object.defineProperty(top, "top", { value: top });
    expect(isRouteableFrame(top)).toBe(true);
  });

  it("returns true for a nested same-origin frame", () => {
    const top = {} as Window;
    Object.defineProperty(top, "location", {
      value: { href: "http://localhost:3000/" },
      configurable: true,
    });
    const self = {} as Window;
    Object.defineProperty(self, "self", { value: self });
    Object.defineProperty(self, "top", { value: top });
    expect(isRouteableFrame(self)).toBe(true);
  });

  it("returns false for a nested cross-origin frame (PRD §23.4)", () => {
    const top = {} as Window;
    Object.defineProperty(top, "location", {
      get() {
        throw new Error("SecurityError: blocked a frame with origin");
      },
      configurable: true,
    });
    const self = {} as Window;
    Object.defineProperty(self, "self", { value: self });
    Object.defineProperty(self, "top", { value: top });
    expect(isRouteableFrame(self)).toBe(false);
  });
});
