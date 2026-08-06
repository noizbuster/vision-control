/**
 * Multi-select emission tests (plan task 2).
 *
 * Drives the overlay runtime through its real DOM surface (shift+click and
 * pointerdown/move/up marquee drag) and asserts the `multi-select-group`
 * message is published to the bus so the panel `useMultiSelect` hook receives
 * it. Group constraints (cross-frame / incompatible-shadow) are enforced via
 * `evaluateGroupConstraints`, which the runtime delegates to.
 *
 * TDD order: these tests were written first and failed on the unchanged
 * runtime (no multi-select-group message was published), then went green once
 * the shift+click branch + marquee controller were wired.
 */

import { evaluateGroupConstraints } from "@vision-control/editor-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BusMessage, BusMessageHandler, BusRoute } from "../messaging/index.js";
import {
  createOverlayRuntime,
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
  readonly emit: (messageType: string, payload: unknown) => void;
} {
  const sent: Array<{ readonly route: BusRoute; readonly message: BusMessage }> = [];
  const handlers = new Map<string, Set<BusMessageHandler>>();

  const send: OverlayRuntimeBus["send"] = (route, message) => {
    sent.push({
      route,
      message: { ...message, sourceRoute: "content", targetRoute: route } as BusMessage,
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

function multiSelectGroupMessages(bus: ReturnType<typeof createFakeBus>): readonly BusMessage[] {
  return bus.sent
    .filter((entry) => entry.message.messageType === "multi-select-group")
    .map((entry) => entry.message);
}

function enableInspect(bus: ReturnType<typeof createFakeBus>): void {
  bus.emit("interaction-mode", { mode: "Inspect" });
}

function click(target: Element, shift = false): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: shift }),
  );
}

function pointerDown(target: Element, x: number, y: number, pointerId = 1): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId,
      button: 0,
    }),
  );
}

function pointerMove(target: Element, x: number, y: number, pointerId = 1): void {
  target.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId,
    }),
  );
}

function pointerUp(target: Element, x: number, y: number, pointerId = 1): void {
  target.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId,
      button: 0,
    }),
  );
}

/** Stub `document.elementsFromPoint` to return page elements whose rect contains the point. */
function stubElementsFromPoint(
  elements: ReadonlyArray<{ readonly el: Element; readonly rect: Rect }>,
): void {
  document.elementsFromPoint = ((x: number, y: number) => {
    const hits: Element[] = [];
    for (const { el, rect } of elements) {
      if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
        hits.push(el);
      }
    }
    return hits;
  }) as typeof document.elementsFromPoint;
}

describe("multi-select emission (overlay runtime)", () => {
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

  it("baseline: a plain click selects one element and publishes NO multi-select-group", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();
    enableInspect(bus);

    const button = document.createElement("button");
    button.id = "solo";
    document.body.appendChild(button);
    setRect(button, { x: 10, y: 10, width: 50, height: 30 });

    click(button);

    expect(multiSelectGroupMessages(bus)).toHaveLength(0);
  });

  it("shift+click adds members to the group, then removes one (publishes on every valid group)", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();
    enableInspect(bus);

    const a = document.createElement("button");
    const b = document.createElement("button");
    const c = document.createElement("button");
    document.body.append(a, b, c);
    setRect(a, { x: 0, y: 0, width: 40, height: 40 });
    setRect(b, { x: 50, y: 0, width: 40, height: 40 });
    setRect(c, { x: 100, y: 0, width: 40, height: 40 });

    click(a, true); // 1 member -> no publish
    expect(multiSelectGroupMessages(bus)).toHaveLength(0);

    click(b, true); // [a,b] -> publish
    click(c, true); // [a,b,c] -> publish
    expect(multiSelectGroupMessages(bus)).toHaveLength(2);

    click(a, true); // remove a -> [b,c] -> publish
    const messages = multiSelectGroupMessages(bus);
    expect(messages).toHaveLength(3);
    const last = messages[2]?.payload as { members: ReadonlyArray<{ runtimeId: string }> };
    expect(last.members).toHaveLength(2);
  });

  it("shift+click down to one member clears the panel group; re-adding yields a fresh group", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();
    enableInspect(bus);

    const a = document.createElement("button");
    const b = document.createElement("button");
    document.body.append(a, b);
    setRect(a, { x: 0, y: 0, width: 40, height: 40 });
    setRect(b, { x: 50, y: 0, width: 40, height: 40 });

    click(a, true);
    click(b, true); // [a,b] published
    expect(multiSelectGroupMessages(bus)).toHaveLength(1);

    click(a, true); // -> [b] publishes null so the panel cannot keep a stale group
    const afterShrink = multiSelectGroupMessages(bus);
    expect(afterShrink).toHaveLength(2);
    expect(afterShrink[1]?.payload).toBeNull();

    // Re-add a fresh third element: group must be [b, d], not stale [a, b].
    const d = document.createElement("button");
    document.body.appendChild(d);
    setRect(d, { x: 100, y: 0, width: 40, height: 40 });
    click(d, true); // [b, d] published
    const messages = multiSelectGroupMessages(bus);
    expect(messages).toHaveLength(3);
    const lastPayload = messages[2]?.payload;
    expect(lastPayload).not.toBeNull();
    expect(
      lastPayload !== null &&
        typeof lastPayload === "object" &&
        "members" in lastPayload &&
        Array.isArray(lastPayload.members) &&
        lastPayload.members.length === 2,
    ).toBe(true);
  });

  it("marquee drag in empty space selects the intersected elements and publishes the group", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();
    enableInspect(bus);

    const a = document.createElement("button");
    const b = document.createElement("button");
    document.body.append(a, b);
    const rectA = { x: 20, y: 20, width: 30, height: 30 };
    const rectB = { x: 120, y: 120, width: 30, height: 30 };
    setRect(a, rectA);
    setRect(b, rectB);
    stubElementsFromPoint([
      { el: a, rect: rectA },
      { el: b, rect: rectB },
    ]);

    // Drag from empty space (body) across both elements.
    pointerDown(document.body, 5, 5);
    pointerMove(document.body, 160, 160);
    pointerUp(document.body, 160, 160);

    const messages = multiSelectGroupMessages(bus);
    expect(messages).toHaveLength(1);
    const payload = messages[0]?.payload as { members: ReadonlyArray<{ tagName: string }> };
    expect(payload.members).toHaveLength(2);
    expect(payload.members.every((m) => m.tagName === "button")).toBe(true);
  });

  it("marquee drag does not auto-convert to absolute positioning (D41: selection only)", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();
    enableInspect(bus);

    const a = document.createElement("button");
    document.body.appendChild(a);
    const rectA = { x: 20, y: 20, width: 30, height: 30 };
    setRect(a, rectA);
    stubElementsFromPoint([{ el: a, rect: rectA }]);

    pointerDown(document.body, 5, 5);
    pointerMove(document.body, 60, 60);
    pointerUp(document.body, 60, 60);

    // No style-edit / position-element op is emitted by a marquee; only the
    // multi-select-group selection message.
    const nonGroup = bus.sent.filter((e) => e.message.messageType !== "multi-select-group");
    expect(nonGroup.every((e) => e.message.messageType !== "editor-command")).toBe(true);
  });

  it("rejects members that violate group constraints (incompatible-shadow runtime path + cross-frame checker)", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();
    enableInspect(bus);

    const light = document.createElement("button");
    document.body.appendChild(light);
    setRect(light, { x: 0, y: 0, width: 40, height: 40 });

    const host = document.createElement("div");
    const openRoot = host.attachShadow({ mode: "open" });
    const shadowed = document.createElement("button");
    openRoot.appendChild(shadowed);
    document.body.appendChild(host);
    setRect(shadowed, { x: 50, y: 0, width: 40, height: 40 });

    click(light, true); // light-dom member
    click(shadowed, true); // open-shadow member -> constraint violation, rejected
    expect(multiSelectGroupMessages(bus)).toHaveLength(0);

    // Cross-origin / cross-frame members cannot be produced by the runtime
    // (cross-origin iframes are opaque). Verify the checker the runtime
    // delegates to rejects an explicit cross-frame pair.
    const crossFrame = evaluateGroupConstraints([
      {
        runtimeId: "r1",
        tagName: "div",
        frameId: "main",
        frameKind: "top",
        shadowKind: "light-dom",
      },
      {
        runtimeId: "r2",
        tagName: "div",
        frameId: "frame-2",
        frameKind: "same-origin-iframe",
        shadowKind: "light-dom",
      },
    ]);
    expect(crossFrame.ok).toBe(false);
  });

  it("the published multi-select-group message shape validates against the group contract", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();
    enableInspect(bus);

    const a = document.createElement("button");
    const b = document.createElement("button");
    document.body.append(a, b);
    setRect(a, { x: 10, y: 10, width: 40, height: 40 });
    setRect(b, { x: 60, y: 10, width: 40, height: 40 });

    click(a, true);
    click(b, true);

    const message = multiSelectGroupMessages(bus).at(-1);
    expect(message, "multi-select-group message must be published").toBeDefined();
    expect(message?.messageType).toBe("multi-select-group");
    expect(message?.targetRoute).toBe("panel");
    const payload = message?.payload as Record<string, unknown>;
    expect(typeof payload.id).toBe("string");
    expect((payload.id as string).length).toBeGreaterThan(0);
    expect(Array.isArray(payload.members)).toBe(true);
    expect((payload.members as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect(payload.shadowRootCompatible).toBe(true);
    expect(payload.frameKind).toBe("top");
    const boundingRect = payload.boundingRect as Record<string, number>;
    for (const key of ["x", "y", "width", "height"]) {
      expect(typeof boundingRect[key]).toBe("number");
    }
  });
});
