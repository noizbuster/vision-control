/**
 * Overlay runtime for the content script.
 *
 * Wires overlay-ui (shadow-DOM root + element) to inspector-core (selection,
 * hover, position tracking) and routes pick/select results to the panel via the
 * message bus. Owns the capture-phase DOM listeners and a RAF-throttled hover
 * path (PRD §28.1). Guards against closed shadow roots (PRD §23.5) and
 * cross-origin frames (PRD §23.4).
 */

import {
  createBrowserDomAdapter,
  createInspector,
  type DomAdapter,
  type Inspector,
  type InspectorBus,
} from "@vision-control/inspector-core";
import {
  attachOverlayRoot,
  createOverlayElement,
  isOverlayElement,
  type OverlayRoot,
} from "@vision-control/overlay-ui";

import type { BusMessage, BusMessageHandler, BusRoute, MessageBus } from "../messaging/index.js";
import { createSelectionSummaryMessage } from "../messaging/panel-messages.js";

/**
 * Narrow bus seam the runtime depends on. {@link MessageBus} satisfies this
 * structurally; tests may pass a smaller fake.
 */
export interface OverlayRuntimeBus {
  readonly send: MessageBus["send"];
  readonly on: MessageBus["on"];
}

export interface OverlayRuntimeOptions {
  readonly document: Document;
  readonly bus: OverlayRuntimeBus;
  /** Override DOM adapter (testing). Defaults to the browser adapter. */
  readonly domAdapter?: DomAdapter;
  /** Override overlay-root factory (testing). Defaults to attachOverlayRoot. */
  readonly attachRoot?: (document: Document) => OverlayRoot;
}

export interface OverlayRuntime {
  readonly start: () => void;
  readonly stop: () => void;
  readonly dispose: () => void;
  readonly getInspector: () => Inspector;
}

/**
 * Create the overlay runtime. Callers must invoke {@link OverlayRuntime.start}
 * to attach DOM listeners and activate inspect mode.
 */
export function createOverlayRuntime(options: OverlayRuntimeOptions): OverlayRuntime {
  const { document: doc, bus } = options;
  const domAdapter = options.domAdapter ?? createBrowserDomAdapter();
  const attach = options.attachRoot ?? attachOverlayRoot;

  const overlayRoot = attach(doc);
  const overlayElement = createOverlayElement(overlayRoot.shadowRoot);

  const inspectorBus: InspectorBus = {
    sendSelection: (_identity, summary) => {
      bus.send("panel", createSelectionSummaryMessage(summary));
    },
    // The inspector clears the overlay locally on deselect; routing a dedicated
    // deselect signal to the panel is a follow-up outside task 18 scope.
    sendDeselect: () => {},
  };

  const inspector = createInspector({
    overlayRoot,
    overlayElement,
    domAdapter,
    bus: inspectorBus,
  });

  // RAF throttle on the hover path (PRD §28.1: 60fps target, <8ms update).
  let hoverRafId: number | null = null;
  let pendingHoverTarget: Element | null = null;

  const cancelHoverRaf = (): void => {
    if (hoverRafId !== null) {
      cancelAnimationFrame(hoverRafId);
      hoverRafId = null;
    }
  };

  const flushHover = (): void => {
    hoverRafId = null;
    inspector.hover(pendingHoverTarget);
  };

  const scheduleHover = (target: Element | null): void => {
    pendingHoverTarget = target;
    if (hoverRafId !== null) return;
    hoverRafId = requestAnimationFrame(flushHover);
  };

  // Closed shadow roots cannot be inspected or edited (PRD §23.5). Event
  // retargeting usually surfaces the host for closed roots, but this guard also
  // rejects any element reference that leaks out of one.
  const isInspectable = (target: Element | null): target is Element =>
    target !== null &&
    !isOverlayElement(target, overlayRoot.host) &&
    !isInsideClosedShadowRoot(target);

  const onMouseMoveCapture = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    scheduleHover(isInspectable(target) ? target : null);
  };

  const onClickCapture = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!isInspectable(target)) return;
    event.preventDefault();
    event.stopPropagation();
    inspector.select(target);
  };

  const onSelectElement: BusMessageHandler = (message) => {
    const payload = message.payload as { readonly selector?: unknown } | undefined;
    if (payload === undefined || typeof payload.selector !== "string") return;
    const target = doc.querySelector(payload.selector);
    if (!isInspectable(target)) return;
    inspector.select(target);
  };

  let selectElementUnsub: (() => void) | null = null;

  const start = (): void => {
    doc.addEventListener("mousemove", onMouseMoveCapture, true);
    doc.addEventListener("click", onClickCapture, true);
    inspector.setInspectMode(true);
    selectElementUnsub = bus.on("select-element", onSelectElement);
  };

  const stop = (): void => {
    cancelHoverRaf();
    doc.removeEventListener("mousemove", onMouseMoveCapture, true);
    doc.removeEventListener("click", onClickCapture, true);
    inspector.setInspectMode(false);
    selectElementUnsub?.();
    selectElementUnsub = null;
  };

  const dispose = (): void => {
    stop();
    inspector.dispose();
  };

  return { start, stop, dispose, getInspector: () => inspector };
}

/**
 * Whether the current frame may host an overlay.
 *
 * The top frame is always routeable. A nested frame is routeable only if it is
 * same-origin with the top frame (so coordinates can be bridged). Cross-origin
 * iframes are opaque and must not attach an overlay (PRD §23.4).
 */
export function isRouteableFrame(win: Window): boolean {
  if (win.top === win.self) return true;
  try {
    void win.top?.location.href;
    return true;
  } catch {
    return false;
  }
}

/**
 * True when `element` lives inside a closed shadow root. Closed roots cannot be
 * inspected or edited (PRD §23.5). Event retargeting usually surfaces the host
 * for such elements, but this predicate also rejects any reference that leaks
 * out of one (e.g. via parent/child cycling).
 */
export function isInsideClosedShadowRoot(element: Element): boolean {
  const root = element.getRootNode();
  return root instanceof ShadowRoot && root.mode === "closed";
}

/** Re-exported for content-script wiring; avoids a second import surface. */
export type { BusMessage, BusRoute };
