/**
 * Overlay runtime for the content script.
 *
 * Wires overlay-ui (shadow-DOM root + element) to inspector-core (selection,
 * hover, position tracking) and routes pick/select results to the panel via the
 * message bus. Owns the capture-phase DOM listeners and a RAF-throttled hover
 * path (PRD §28.1). Guards against closed shadow roots (PRD §23.5) and
 * cross-origin frames (PRD §23.4).
 */

import type { Operation } from "@vision-control/change-ir";
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
import type {
  BusMessage,
  BusMessageHandler,
  BusRoute,
  InteractionModePayload,
  MessageBus,
} from "../messaging/index.js";
import { type BreakpointController, createBreakpointController } from "./breakpoint-controller.js";
import {
  createGridPlacementController,
  type GridPlacementController,
} from "./grid-placement-controller.js";
import {
  buildSelectionContext,
  createInteractionControllers,
  getOrAssignPreviewRuntimeId,
  type InteractionControllers,
} from "./interaction-wiring.js";
import { createMarqueeController, type MarqueeController } from "./marquee-controller.js";
import {
  createMultiSelectController,
  type MultiSelectController,
} from "./multi-select-controller.js";
import { createPropertyInspector, type PropertyInspector } from "./property-inspector.js";

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
  readonly setInteractionMode: (mode: InteractionMode | null) => void;
  readonly getInteractionMode: () => InteractionMode | null;
  /**
   * Apply a panel-driven operation to the page DOM. The content script is the
   * single DOM applier; the panel never mutates the DOM directly.
   */
  readonly applyOperation: (operation: Operation) => void;
  readonly clearPreviews: () => void;
  readonly getPreviewClearer: () => PreviewManager;
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
    getRuntimeId: getOrAssignPreviewRuntimeId,
  });

  const previewDom = createBrowserPreviewDomAdapter();
  const previewManager: PreviewManager = createPreviewManager({ dom: previewDom });

  const overlayContainer = overlayRoot.shadowRoot.querySelector<HTMLElement>(".vc-overlay-root");
  const enableControllers = options.interactionControllers ?? true;
  let controllers: InteractionControllers | null = null;
  if (enableControllers && overlayContainer !== null) {
    controllers = createInteractionControllers({
      overlayElement,
      overlayContainer,
      previewManager,
      bus,
      document: doc,
    });
  }

  const propertyInspector: PropertyInspector = createPropertyInspector({
    document: doc,
    shadowRoot: overlayRoot.shadowRoot,
    previewManager,
    bus,
  });

  // Grid-placement emission (plan task 4): on selection of a grid child,
  // derive the track geometry + cell via inferGridCells and publish
  // grid-placement so the useGridPlacement hook fills the InspectorPanel grid
  // slot. Non-grid selections publish nothing (no crash).
  const gridPlacement: GridPlacementController = createGridPlacementController({ bus });

  const notifySelection = (target: Element): void => {
    const context = buildSelectionContext(target);
    previewDom.registerElement(context.elementRef.runtimeId, target);
    controllers?.onSelectionChange(context);
    gridPlacement.onSelection(target);
    propertyInspector.showFor(target, { runtimeId: context.elementRef.runtimeId });
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
  let interactionMode: InteractionMode | null = null;
  let inspectListenersAttached = false;

  const setInspectListeners = (active: boolean): void => {
    if (active === inspectListenersAttached) return;
    inspectListenersAttached = active;
    if (active) {
      doc.addEventListener("mousemove", onMouseMoveCapture, true);
      doc.addEventListener("click", onClickCapture, true);
      marquee.attach();
      inspector.setInspectMode(true);
      return;
    }
    cancelHoverRaf();
    doc.removeEventListener("mousemove", onMouseMoveCapture, true);
    doc.removeEventListener("click", onClickCapture, true);
    marquee.detach();
    inspector.setInspectMode(false);
  };

  const setInteractionMode = (mode: InteractionMode | null): void => {
    interactionMode = mode;
    keyboard.setMode(mode ?? "Inspect");
    setInspectListeners(mode === "Inspect");
    if (mode === "Move") {
      controllers?.attach();
    } else if (mode === "Resize") {
      controllers?.detachMove();
    } else {
      controllers?.detach();
    }
  };

  const getInteractionMode = (): InteractionMode | null => interactionMode;

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

  const onInteractionMode: BusMessageHandler = (message) => {
    const payload = message.payload;
    if (!isInteractionModePayload(payload)) return;
    setInteractionMode(payload.mode);
  };

  let selectElementUnsub: (() => void) | null = null;
  let interactionModeUnsub: (() => void) | null = null;

  const start = (): void => {
    breakpoint.attach();
    setInteractionMode(interactionMode);
    selectElementUnsub = bus.on("select-element", onSelectElement);
    interactionModeUnsub = bus.on("interaction-mode", onInteractionMode);
  };

  const stop = (): void => {
    controllers?.detach();
    setInspectListeners(false);
    breakpoint.detach();
    selectElementUnsub?.();
    selectElementUnsub = null;
    interactionModeUnsub?.();
    interactionModeUnsub = null;
  };

  const dispose = (): void => {
    stop();
    propertyInspector.dispose();
    controllers?.dispose();
    controllers = null;
    gridPlacement.dispose();
    multiSelect.dispose();
    breakpoint.dispose();
    inspector.dispose();
  };

  const applyOperation = (operation: Operation): void => {
    previewManager.applyOperation(operation);
    if (operation.kind === "remove-element") {
      inspector.deselect();
      controllers?.onSelectionChange(null);
      propertyInspector.hide();
    }
  };

  const clearPreviews = (): void => {
    previewManager.clearAll();
  };

  return {
    start,
    stop,
    dispose,
    getInspector: () => inspector,
    getInteractionControllers: () => controllers,
    setInteractionMode,
    getInteractionMode,
    applyOperation,
    clearPreviews,
    getPreviewClearer: () => previewManager,
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

function isRuntimeInteractionMode(mode: unknown): mode is InteractionMode | null {
  return (
    mode === null ||
    mode === "Inspect" ||
    mode === "Move" ||
    mode === "Resize" ||
    mode === "Text" ||
    mode === "Layout"
  );
}

function isInteractionModePayload(payload: unknown): payload is InteractionModePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "mode" in payload &&
    isRuntimeInteractionMode(payload.mode)
  );
}

/** Re-exported for content-script wiring; avoids a second import surface. */
export type { BusMessage, BusRoute };
