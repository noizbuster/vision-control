/**
 * Grid-placement emission tests (plan task 4).
 *
 * Drives the overlay runtime through its real DOM surface (a click selecting a
 * CSS-Grid child) and asserts the `grid-placement` message is published to the
 * bus so the panel `useGridPlacement` hook fills the InspectorPanel grid slot.
 * `createGridPlacementMessage` (panel-messages.ts) had ZERO callers before this
 * task; these tests prove the emission now happens.
 *
 * TDD order: written first. Before the grid-placement controller was wired,
 * selecting a grid child published NO grid-placement message, so every
 * assertion below failed. They go green once the controller is instantiated in
 * the overlay runtime and called from `notifySelection`.
 *
 * jsdom does not implement CSS Grid layout, so `getComputedStyle` is stubbed to
 * return explicit px track sizes + the child rects are mocked to be consistent
 * with the stubbed geometry (the same coordinate-system contract the browser
 * satisfies natively).
 */

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

/**
 * Stub `window.getComputedStyle` so the grid parent (and any tagged element)
 * returns the given style overrides, while every other property and every
 * untagged element falls through to jsdom's real CSSStyleDeclaration. The
 * ResizeController / layout-role classifier read `flexDirection`/`position`
 * off the selected child, so a wholesale replacement breaks them; the Proxy
 * keeps those reads truthful while injecting the grid track sizes jsdom
 * cannot compute (it does not implement CSS Grid layout).
 */
function installGetComputedStyleStub(
  styleByElement: Map<Element, Record<string, string>>,
): () => void {
  const win = window;
  const real = win.getComputedStyle.bind(win);
  win.getComputedStyle = ((elt: Element) => {
    const realDecl = real(elt);
    const override = styleByElement.get(elt);
    if (override === undefined) return realDecl;
    return new Proxy(realDecl, {
      get(target, prop: string | symbol) {
        if (typeof prop === "string" && prop in override) {
          return override[prop];
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof win.getComputedStyle;
  return () => {
    win.getComputedStyle = real;
  };
}

function createFakeBus(): OverlayRuntimeBus & {
  readonly sent: ReadonlyArray<{ readonly route: BusRoute; readonly message: BusMessage }>;
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

  return { send, on, sent };
}

function gridPlacementMessages(bus: ReturnType<typeof createFakeBus>): readonly BusMessage[] {
  return bus.sent
    .filter((entry) => entry.message.messageType === "grid-placement")
    .map((entry) => entry.message);
}

function click(target: Element): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("grid-placement emission (overlay runtime)", () => {
  let runtime: OverlayRuntime | null = null;
  let restoreGetComputedStyle: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
  });

  afterEach(() => {
    runtime?.dispose();
    runtime = null;
    restoreGetComputedStyle?.();
    restoreGetComputedStyle = null;
  });

  it("selecting a grid child publishes grid-placement with the inferred placement", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();

    const grid = document.createElement("div");
    const card = document.createElement("div");
    grid.appendChild(card);
    document.body.appendChild(grid);
    setRect(grid, { x: 0, y: 0, width: 300, height: 100 });
    setRect(card, { x: 100, y: 0, width: 90, height: 40 }); // column 2, row 1

    restoreGetComputedStyle = installGetComputedStyleStub(
      new Map([
        [
          grid,
          {
            display: "grid",
            gridTemplateColumns: "100px 100px 100px",
            gridTemplateRows: "50px 50px",
          },
        ],
        [card, {}],
      ]),
    );

    click(card);

    const messages = gridPlacementMessages(bus);
    expect(messages, "grid-placement must be published on grid-child selection").toHaveLength(1);
    const payload = messages[0]?.payload as {
      placement: { column: number; row: number } | null;
      spanCandidates: unknown[];
      reorderChoice: unknown;
      a11yWarning: string | null;
    };
    expect(payload.placement, "placement must be inferred (non-null)").not.toBeNull();
    expect((payload.placement as { column: number }).column).toBe(2);
    expect((payload.placement as { row: number }).row).toBe(1);
    expect(payload.spanCandidates.length).toBeGreaterThan(0);
    expect(payload.reorderChoice).toBeNull();
    expect(payload.a11yWarning).toBeNull();
  });

  it("non-grid element selection publishes NO grid-placement (malformed: no crash, no message)", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();

    const flex = document.createElement("div");
    const item = document.createElement("div");
    flex.appendChild(item);
    document.body.appendChild(flex);
    setRect(flex, { x: 0, y: 0, width: 300, height: 100 });
    setRect(item, { x: 0, y: 0, width: 90, height: 40 });

    restoreGetComputedStyle = installGetComputedStyleStub(
      new Map([
        [
          flex,
          {
            display: "flex",
            gridTemplateColumns: "100px 100px 100px",
            gridTemplateRows: "50px 50px",
          },
        ],
        [item, {}],
      ]),
    );

    click(item);

    expect(gridPlacementMessages(bus)).toHaveLength(0);
  });

  it("re-selecting a grid child publishes a fresh grid-placement (stale_state)", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();

    const grid = document.createElement("div");
    const a = document.createElement("div");
    const b = document.createElement("div");
    grid.append(a, b);
    document.body.appendChild(grid);
    setRect(grid, { x: 0, y: 0, width: 300, height: 100 });
    setRect(a, { x: 0, y: 0, width: 90, height: 40 }); // column 1
    setRect(b, { x: 100, y: 0, width: 90, height: 40 }); // column 2

    restoreGetComputedStyle = installGetComputedStyleStub(
      new Map([
        [
          grid,
          {
            display: "grid",
            gridTemplateColumns: "100px 100px 100px",
            gridTemplateRows: "50px 50px",
          },
        ],
        [a, {}],
        [b, {}],
      ]),
    );

    click(a);
    click(b); // re-select a different grid child

    const messages = gridPlacementMessages(bus);
    expect(messages, "each grid-child selection must publish a fresh grid-placement").toHaveLength(
      2,
    );
    const first = messages[0]?.payload as { placement: { column: number } | null };
    const second = messages[1]?.payload as { placement: { column: number } | null };
    expect((first.placement as { column: number }).column).toBe(1);
    expect((second.placement as { column: number }).column).toBe(2);
  });

  it("the published grid-placement message shape validates against the panel contract", () => {
    const bus = createFakeBus();
    runtime = createOverlayRuntime({ document: document, bus });
    runtime.start();

    const grid = document.createElement("section");
    const card = document.createElement("article");
    grid.appendChild(card);
    document.body.appendChild(grid);
    setRect(grid, { x: 0, y: 0, width: 200, height: 50 });
    setRect(card, { x: 0, y: 0, width: 90, height: 40 });

    restoreGetComputedStyle = installGetComputedStyleStub(
      new Map([
        [grid, { display: "grid", gridTemplateColumns: "100px 100px", gridTemplateRows: "50px" }],
        [card, {}],
      ]),
    );

    click(card);

    const message = gridPlacementMessages(bus).at(-1);
    expect(message, "grid-placement message must be published").toBeDefined();
    expect(message?.messageType).toBe("grid-placement");
    expect(message?.targetRoute).toBe("panel");
    const payload = message?.payload as Record<string, unknown>;
    expect(typeof (payload.gridContainer as { runtimeId: unknown }).runtimeId).toBe("string");
    expect(typeof (payload.child as { runtimeId: unknown }).runtimeId).toBe("string");
    const placement = payload.placement as { column: number; row: number; columnSpan: number };
    expect(typeof placement.column).toBe("number");
    expect(typeof placement.row).toBe("number");
    expect(Array.isArray(payload.spanCandidates)).toBe(true);
    expect(payload.reorderChoice).toBeNull();
    expect(payload.a11yWarning).toBeNull();
  });
});
