import type { Operation } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";
import {
  attachOverlayRoot,
  createOverlayElement,
  type OverlayElement,
  type OverlayRoot,
  type ResizeHandlePosition,
} from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  type PreviewManager,
} from "@vision-control/preview-engine";
import { expect, vi } from "vitest";

import type { ReorderDiagnostic } from "../components/interaction/ReorderController.js";
import type { ResizeDiagnostic } from "../components/interaction/ResizeController.js";
import type { BusMessage, BusMessageHandler, BusRoute } from "../messaging/index.js";
import { captureSelectionContext, type SelectionContext } from "./interaction-selection-capture.js";
import {
  createInteractionControllers,
  type InteractionBus,
  type InteractionControllers,
} from "./interaction-wiring.js";

export interface SentMessage {
  readonly route: BusRoute;
  readonly message: BusMessage;
}

export interface FakeInteractionBus extends InteractionBus {
  readonly sent: SentMessage[];
  readonly emit: (messageType: string, payload: unknown) => void;
}

export interface OverlayFixture {
  readonly root: OverlayRoot;
  readonly overlayElement: OverlayElement;
  readonly overlayContainer: HTMLElement;
}

export interface InteractionHarness {
  readonly bus: FakeInteractionBus;
  readonly previewManager: PreviewManager;
  readonly overlay: OverlayFixture;
  readonly controllers: InteractionControllers;
  readonly diagnostics: (ReorderDiagnostic | ResizeDiagnostic)[];
  readonly setOperationObserver: (observer: ((operation: Operation) => void) | null) => void;
  readonly dispose: () => void;
}

class ResizeObserverStub implements ResizeObserver {
  disconnect(): void {}
  observe(_target: Element, _options?: ResizeObserverOptions): void {}
  unobserve(_target: Element): void {}
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  disconnect(): void {}
  observe(_target: Element): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(_target: Element): void {}
}

export function installInteractionDom(): void {
  document.documentElement.innerHTML = "<head></head><body></body>";
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
}

export function createFakeBus(): FakeInteractionBus {
  const sent: SentMessage[] = [];
  const handlers = new Map<string, Set<BusMessageHandler>>();
  const send: InteractionBus["send"] = (route, message) => {
    sent.push({ route, message });
  };
  const on: InteractionBus["on"] = (messageType, handler) => {
    const existing = handlers.get(messageType);
    const selected = existing ?? new Set<BusMessageHandler>();
    if (existing === undefined) handlers.set(messageType, selected);
    selected.add(handler);
    return () => selected.delete(handler);
  };
  const emit = (messageType: string, payload: unknown): void => {
    const message: BusMessage = {
      protocolVersion: "1.0.0",
      messageId: `test-${messageType}`,
      messageType,
      sourceRoute: "panel",
      targetRoute: "content",
      payload,
      timestamp: 0,
    };
    for (const handler of handlers.get(messageType) ?? []) {
      handler(message, { route: "panel" });
    }
  };
  return { send, on, sent, emit };
}

export function createOverlayFixture(): OverlayFixture {
  const root = attachOverlayRoot(document);
  const overlayElement = createOverlayElement(root.shadowRoot);
  const overlayContainer = root.shadowRoot.querySelector<HTMLElement>(".vc-overlay-root");
  if (overlayContainer === null) throw new Error("overlay root container not found");
  return { root, overlayElement, overlayContainer };
}

export function createInteractionHarness(): InteractionHarness {
  installInteractionDom();
  const bus = createFakeBus();
  const previewManager = createPreviewManager({ dom: createBrowserPreviewDomAdapter() });
  const overlay = createOverlayFixture();
  let operationObserver: ((operation: Operation) => void) | null = null;
  const diagnostics: (ReorderDiagnostic | ResizeDiagnostic)[] = [];
  const controllers = createInteractionControllers({
    overlayElement: overlay.overlayElement,
    overlayContainer: overlay.overlayContainer,
    previewManager,
    bus,
    onOperationApplied: (operation) => operationObserver?.(operation),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    onResizeDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  return {
    bus,
    previewManager,
    overlay,
    controllers,
    diagnostics,
    setOperationObserver: (observer) => {
      operationObserver = observer;
    },
    dispose: () => {
      controllers.dispose();
      overlay.root.unmount();
      vi.unstubAllGlobals();
    },
  };
}

export function setRect(element: Element, rect: Rect): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(rect.x, rect.y, rect.width, rect.height),
  );
}

export function requireSelectionContext(element: Element): SelectionContext {
  const result = captureSelectionContext(element);
  if (!result.ok) throw new Error(`selection capture failed: ${result.diagnostic}`);
  return result.context;
}

export function dispatchPointer(target: EventTarget, type: string, init: PointerEventInit): void {
  target.dispatchEvent(new PointerEvent(type, { ...init, bubbles: true, cancelable: true }));
}

export function prepareResizeHandle(
  harness: InteractionHarness,
  position: ResizeHandlePosition,
): HTMLElement {
  const handle = harness.overlay.overlayElement.getResizeHandle(position);
  if (handle === null) throw new Error(`resize handle ${position} not found`);
  handle.setPointerCapture = vi.fn();
  handle.releasePointerCapture = vi.fn();
  return handle;
}

export function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function interactionOperationMessages(bus: FakeInteractionBus): readonly BusMessage[] {
  return bus.sent
    .filter((entry) => entry.message.messageType === "interaction-operation")
    .map((entry) => entry.message);
}

export function assertNoPositionElement(operations: readonly Operation[]): void {
  expect(operations.filter((operation) => operation.kind === "position-element")).toEqual([]);
}

export function visibleDropIndicator(container: HTMLElement): HTMLElement {
  const indicator = Array.from(container.querySelectorAll<HTMLElement>(".vc-drop-indicator")).find(
    (element) => element.style.display === "block",
  );
  if (indicator === undefined) throw new Error("drop indicator was not visible");
  return indicator;
}

export function reparentDropIndicator(container: HTMLElement): HTMLElement {
  const indicators = container.querySelectorAll<HTMLElement>(".vc-drop-indicator");
  const indicator = indicators.item(indicators.length - 1);
  if (indicator === null) throw new Error("reparent drop indicator was not mounted");
  return indicator;
}
