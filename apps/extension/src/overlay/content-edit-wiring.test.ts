/**
 * Integration test for the panel -> content edit-application path.
 *
 * Proves the reverse path that was severed in three places:
 *  1. The overlay runtime exposes applyOperation/clearPreviews.
 *  2. The content-side wiring listens for "editor-command" (not the dead
 *     "edit-request") and routes the op to runtime.applyOperation.
 *  3. A real DOM mutation results (non-vacuous: fails if the handler is a
 *     no-op stub) and undo/clear revert it.
 *
 * The fake bus mirrors the panel->background->content hop: the test emits the
 * exact "editor-command"/"clear-preview" bus messages the background forwards
 * into the content frame after fix (c).
 */

import type { Operation } from "@vision-control/change-ir";
import { computeInverse } from "@vision-control/change-ir";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BusMessage, BusMessageHandler, BusRoute } from "../messaging/index.js";
import { wireContentEditHandlers } from "./content-edit-wiring.js";
import {
  createOverlayRuntime,
  type OverlayRuntime,
  type OverlayRuntimeBus,
} from "./overlay-runtime.js";

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

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn((): MediaQueryList => ({ matches: false, media: "" }) as MediaQueryList),
    configurable: true,
    writable: true,
  });
}

function setRect(element: Element, x: number, y: number, w: number, h: number): void {
  vi.spyOn(element as HTMLElement, "getBoundingClientRect").mockReturnValue({
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  } as DOMRect);
}

function createFakeBus(): OverlayRuntimeBus & {
  readonly emit: (messageType: string, payload: unknown) => void;
} {
  const handlers = new Map<string, Set<BusMessageHandler>>();
  const send: OverlayRuntimeBus["send"] = () => {};
  const on: OverlayRuntimeBus["on"] = (messageType, handler) => {
    let set = handlers.get(messageType);
    if (set === undefined) {
      set = new Set();
      handlers.set(messageType, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  };
  const emit = (messageType: string, payload: unknown): void => {
    const message = {
      protocolVersion: "1.0.0",
      messageId: `test-${messageType}-${Date.now()}`,
      messageType,
      sourceRoute: "background" as BusRoute,
      targetRoute: "content" as BusRoute,
      payload,
      timestamp: Date.now(),
    } as BusMessage;
    for (const handler of handlers.get(messageType) ?? []) {
      handler(message, { route: "background" });
    }
  };
  return { send, on, emit };
}

function enableInspect(bus: ReturnType<typeof createFakeBus>): void {
  bus.emit("interaction-mode", { mode: "Inspect" });
}

const BASE_TIME = 1_700_000_000_000;

function styleEdit(id: string, runtimeId: string, value: string): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "style-edit",
    target: { runtimeId },
    property: "color",
    value,
    important: false,
    previousValue: "red",
  };
}

function classAdd(id: string, runtimeId: string, className: string): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "class-add",
    target: { runtimeId },
    className,
  };
}

function textEdit(id: string, runtimeId: string, newText: string): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "text-edit",
    target: { runtimeId },
    newText,
  };
}

function removeElement(
  id: string,
  runtimeId: string,
  parentRuntimeId: string,
  index: number,
): Operation {
  return {
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "remove-element",
    element: { runtimeId },
    parent: { runtimeId: parentRuntimeId },
    index,
    tagName: "button",
  };
}

describe("content edit wiring (panel -> content apply path)", () => {
  let runtime: OverlayRuntime | null = null;
  let bus: ReturnType<typeof createFakeBus>;
  let wiring: { dispose: () => void } | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
    installMatchMedia();
    bus = createFakeBus();
    runtime = createOverlayRuntime({ document, bus });
    runtime.start();
    enableInspect(bus);
    wiring = wireContentEditHandlers(bus, runtime);
  });

  afterEach(() => {
    wiring?.dispose();
    runtime?.dispose();
    runtime = null;
    wiring = null;
  });

  it("applies a style-edit editor-command to the page DOM (non-vacuous)", () => {
    const target = document.createElement("button");
    target.id = "styled-btn";
    setRect(target, 0, 0, 40, 20);
    document.body.appendChild(target);
    // Selection registers the element + assigns its preview id, mirroring the
    // real click path that panel-driven edits depend on.
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const runtimeId = target.getAttribute("data-vc-preview-id");
    expect(runtimeId, "selection must assign a preview id").not.toBeNull();
    if (runtimeId === null) return;

    const op = styleEdit("op-style-001", runtimeId, "rgb(0, 0, 255)");
    bus.emit("editor-command", op);

    const styleEl = document.head.querySelector<HTMLStyleElement>(
      "style[data-vc-preview-stylesheet]",
    );
    expect(styleEl, "preview stylesheet must be injected into <head>").not.toBeNull();
    expect(styleEl?.textContent ?? "").toContain(`[data-vc-preview-id="${runtimeId}"]`);
    expect(styleEl?.textContent ?? "").toContain("color: rgb(0, 0, 255)");
  });

  it("applies a class-add editor-command and mutates the element's classList", () => {
    const target = document.createElement("div");
    target.id = "classed-div";
    target.className = "base";
    setRect(target, 0, 0, 40, 20);
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const runtimeId = target.getAttribute("data-vc-preview-id");
    if (runtimeId === null) throw new Error("preview id not assigned");

    expect(target.classList.contains("highlight")).toBe(false);
    bus.emit("editor-command", classAdd("op-class-001", runtimeId, "highlight"));
    expect(target.classList.contains("highlight")).toBe(true);
  });

  it("undo: emitting the inverse editor-command reverts the DOM mutation", () => {
    const target = document.createElement("div");
    target.id = "undo-div";
    target.className = "base";
    setRect(target, 0, 0, 40, 20);
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const runtimeId = target.getAttribute("data-vc-preview-id");
    if (runtimeId === null) throw new Error("preview id not assigned");

    const op = classAdd("op-undo-001", runtimeId, "temporary");
    bus.emit("editor-command", op);
    expect(target.classList.contains("temporary")).toBe(true);

    const inverse = computeInverse(op);
    bus.emit("editor-command", inverse);
    expect(target.classList.contains("temporary")).toBe(false);
  });

  it("applies a text-edit editor-command and mutates textContent", () => {
    const target = document.createElement("span");
    target.id = "text-span";
    target.textContent = "before";
    setRect(target, 0, 0, 40, 20);
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const runtimeId = target.getAttribute("data-vc-preview-id");
    if (runtimeId === null) throw new Error("preview id not assigned");

    bus.emit("editor-command", textEdit("op-text-001", runtimeId, "after"));
    expect(target.textContent).toBe("after");
  });

  it("applies a remove-element editor-command and clear-preview restores the node", () => {
    const parent = document.createElement("section");
    const target = document.createElement("button");
    target.textContent = "Delete me";
    parent.appendChild(target);
    document.body.appendChild(parent);
    setRect(parent, 0, 0, 80, 30);
    setRect(target, 0, 0, 40, 20);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const runtimeId = target.getAttribute("data-vc-preview-id");
    const parentRuntimeId = parent.getAttribute("data-vc-preview-id");
    if (runtimeId === null) throw new Error("preview id not assigned");
    if (parentRuntimeId === null) throw new Error("parent preview id not assigned");

    bus.emit("editor-command", removeElement("op-delete-001", runtimeId, parentRuntimeId, 0));
    expect(parent.contains(target)).toBe(false);

    bus.emit("clear-preview", {});
    expect(parent.contains(target)).toBe(true);
  });

  it("clear-preview removes all applied preview mutations from the DOM", () => {
    const target = document.createElement("div");
    target.id = "clear-div";
    target.className = "base";
    setRect(target, 0, 0, 40, 20);
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const runtimeId = target.getAttribute("data-vc-preview-id");
    if (runtimeId === null) throw new Error("preview id not assigned");

    bus.emit("editor-command", classAdd("op-clear-001", runtimeId, "ephemeral"));
    bus.emit("editor-command", styleEdit("op-clear-002", runtimeId, "rgb(255, 0, 0)"));
    expect(target.classList.contains("ephemeral")).toBe(true);
    expect(document.head.querySelector("style[data-vc-preview-stylesheet]")).not.toBeNull();

    bus.emit("clear-preview", {});

    expect(target.classList.contains("ephemeral")).toBe(false);
    expect(document.head.querySelector("style[data-vc-preview-stylesheet]")).toBeNull();
  });

  it("does not apply an editor-command whose payload is missing the operation", () => {
    const target = document.createElement("div");
    target.id = "no-op-div";
    target.className = "base";
    setRect(target, 0, 0, 40, 20);
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    // Malformed payload must not throw and must not mutate the DOM.
    expect(() => bus.emit("editor-command", { notAnOperation: true })).not.toThrow();
    expect(target.className).toBe("base");
  });
});
