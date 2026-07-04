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
  type InteractionMode,
  isOverlayElement,
  type OverlayRoot,
} from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  type PreviewManager,
} from "@vision-control/preview-engine";

import type { BusMessage, BusMessageHandler, BusRoute, MessageBus } from "../messaging/index.js";
import { type BreakpointController, createBreakpointController } from "./breakpoint-controller.js";
import {
  buildSelectionContext,
  createInteractionControllers,
  type InteractionControllers,
} from "./interaction-wiring.js";
import { createMarqueeController, type MarqueeController } from "./marquee-controller.js";
import {
  createMultiSelectController,
  type MultiSelectController,
} from "./multi-select-controller.js";

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
  /** Instantiate the interaction controllers. Defaults to true. */
  readonly interactionControllers?: boolean;
  /**
   * Workspace Tailwind `screens` scale delivered daemon-side (plan task 7). The
   * content runtime MUST NOT import `@vision-control/tailwind` (platform:node);
   * the daemon populates this and the resolver falls back to a hardcoded
   * default scale when absent.
   */
  readonly screens?: readonly string[];
}

export interface OverlayRuntime {
  readonly start: () => void;
  readonly stop: () => void;
  readonly dispose: () => void;
  readonly getInspector: () => Inspector;
  readonly getInteractionControllers: () => InteractionControllers | null;
  /** Switch the active PRD §8.3 interaction mode (gates controller behavior). */
  readonly setInteractionMode: (mode: InteractionMode) => void;
  readonly getInteractionMode: () => InteractionMode;
}

/**
 * Create the overlay runtime. Callers must invoke {@link OverlayRuntime.start}
 * to attach DOM listeners and activate inspect mode.
 */
// allow: SIZE_OK — wiring-orchestrator hub; marquee/multi-select/breakpoint controllers already extracted. Remaining content is irreducible event-handler + mode-management wiring.
export function createOverlayRuntime(options: OverlayRuntimeOptions): OverlayRuntime {
  const { document: doc, bus } = options;
  const domAdapter = options.domAdapter ?? createBrowserDomAdapter();
  const attach = options.attachRoot ?? attachOverlayRoot;

  const overlayRoot = attach(doc);
  const overlayElement = createOverlayElement(overlayRoot.shadowRoot);

  const breakpoint: BreakpointController = createBreakpointController({
    window: doc.defaultView ?? window,
    bus,
    ...(options.screens !== undefined ? { screens: options.screens } : {}),
  });

  const inspectorBus: InspectorBus = {
    sendSelection: (_identity, summary) => breakpoint.onSelection(summary),
    sendDeselect: () => breakpoint.clear(),
  };

  const inspector = createInspector({
    overlayRoot,
    overlayElement,
    domAdapter,
    bus: inspectorBus,
  });

  const overlayContainer = overlayRoot.shadowRoot.querySelector<HTMLElement>(".vc-overlay-root");
  const enableControllers = options.interactionControllers ?? true;
  let controllers: InteractionControllers | null = null;
  if (enableControllers && overlayContainer !== null) {
    const previewManager: PreviewManager = createPreviewManager({
      dom: createBrowserPreviewDomAdapter(),
    });
    controllers = createInteractionControllers({
      overlayElement,
      overlayContainer,
      previewManager,
      bus,
    });
  }

  const notifySelection = (target: Element): void => {
    controllers?.onSelectionChange(buildSelectionContext(target));
  };

  // Multi-select (PRD §9.1): shift+click toggles membership; a marquee drag in
  // empty space replaces the group. The controller publishes the panel message.
  const multiSelect: MultiSelectController = createMultiSelectController({ document: doc, bus });
  const marquee: MarqueeController = createMarqueeController({
    document: doc,
    overlayHost: overlayRoot.host,
    shadowRoot: overlayRoot.shadowRoot,
    onComplete: (hits) => {
      if (hits.length === 0) {
        multiSelect.reset();
        return;
      }
      multiSelect.setFromMarquee(hits);
    },
  });

  // PRD §8.3 interaction mode management. The keyboard controller lives inside
  // the inspector; the runtime drives its mode and gates which Task-19
  // controller receives pointer events. Move mode attaches the reorder
  // controller; Inspect/Text/Layout detach it so arrow keys cycle the
  // breadcrumb instead of reordering. Resize keeps the resize handles that
  // attach on selection.
  const keyboard = inspector.getKeyboardController();
  let interactionMode: InteractionMode = "Inspect";

  const setInteractionMode = (mode: InteractionMode): void => {
    interactionMode = mode;
    keyboard.setMode(mode);
    if (mode === "Move") {
      controllers?.attach();
    } else if (mode !== "Resize") {
      controllers?.detach();
    }
  };

  const getInteractionMode = (): InteractionMode => interactionMode;

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
    if (marquee.consumeCompletedGesture()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target as Element | null;
    if (!isInspectable(target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      multiSelect.toggle(target);
      return;
    }
    multiSelect.reset();
    inspector.select(target);
    notifySelection(target);
  };

  const onSelectElement: BusMessageHandler = (message) => {
    const payload = message.payload as { readonly selector?: unknown } | undefined;
    if (payload === undefined || typeof payload.selector !== "string") return;
    const target = doc.querySelector(payload.selector);
    if (!isInspectable(target)) return;
    inspector.select(target);
    notifySelection(target);
  };

  let selectElementUnsub: (() => void) | null = null;

  const start = (): void => {
    doc.addEventListener("mousemove", onMouseMoveCapture, true);
    doc.addEventListener("click", onClickCapture, true);
    breakpoint.attach();
    marquee.attach();
    inspector.setInspectMode(true);
    keyboard.setMode(interactionMode);
    selectElementUnsub = bus.on("select-element", onSelectElement);
  };

  const stop = (): void => {
    controllers?.detach();
    cancelHoverRaf();
    doc.removeEventListener("mousemove", onMouseMoveCapture, true);
    doc.removeEventListener("click", onClickCapture, true);
    breakpoint.detach();
    marquee.detach();
    inspector.setInspectMode(false);
    selectElementUnsub?.();
    selectElementUnsub = null;
  };

  const dispose = (): void => {
    stop();
    controllers?.dispose();
    controllers = null;
    multiSelect.dispose();
    breakpoint.dispose();
    inspector.dispose();
  };

  return {
    start,
    stop,
    dispose,
    getInspector: () => inspector,
    getInteractionControllers: () => controllers,
    setInteractionMode,
    getInteractionMode,
  };
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
