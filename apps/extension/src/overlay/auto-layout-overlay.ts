/**
 * On-page Auto Layout chrome for Layout interaction mode.
 *
 * Shadow-DOM floating panel with AutoLayoutPanel parity, gap drag handle, and
 * flex/grid axis indicator. Edits apply via PreviewManager and journal through
 * inspector-edit with origin "canvas-drag".
 */

import type { Operation } from "@vision-control/change-ir";
import type { AutoLayoutCommand, AutoLayoutContainerContext } from "@vision-control/layout-engine";
import { createFlexGridAxis, type FlexGridAxis } from "@vision-control/overlay-ui";
import type { PreviewManager } from "@vision-control/preview-engine";

import {
  type AutoLayoutElementRef,
  buildAutoLayoutOperations,
  isFlexOrGridDisplay,
} from "../components/inspector/auto-layout-operations.js";
import type { BusMessage, BusRoute } from "../messaging/index.js";
import { createInspectorEditMessage } from "../messaging/index.js";
import type { GapGesture } from "./auto-layout-gap-gesture.js";
import { AUTO_LAYOUT_OVERLAY_CSS } from "./auto-layout-overlay-css.js";
import { OVERLAY_CLASS } from "./auto-layout-overlay-dom.js";
import { renderSupportedPanel } from "./auto-layout-overlay-panel.js";
import { getOrAssignPreviewRuntimeId } from "./interaction-selection-capture.js";

export interface AutoLayoutOverlayBus {
  readonly send: (
    targetRoute: BusRoute,
    message: Omit<BusMessage, "sourceRoute" | "targetRoute">,
  ) => void | Promise<void>;
}

export interface AutoLayoutOverlayOptions {
  readonly document: Document;
  readonly shadowRoot: ShadowRoot;
  readonly previewManager: PreviewManager;
  readonly bus: AutoLayoutOverlayBus;
  readonly registerElement: (runtimeId: string, element: Element) => void;
}

export interface AutoLayoutOverlay {
  readonly showFor: (element: Element, elementRef: AutoLayoutElementRef) => void;
  readonly hide: () => void;
  readonly setActive: (active: boolean) => void;
  readonly dispose: () => void;
}

export function createAutoLayoutOverlay(options: AutoLayoutOverlayOptions): AutoLayoutOverlay {
  const { document: doc, shadowRoot, previewManager, bus, registerElement } = options;

  const style = doc.createElement("style");
  style.textContent = AUTO_LAYOUT_OVERLAY_CSS;
  shadowRoot.appendChild(style);

  const root = doc.createElement("div");
  root.className = OVERLAY_CLASS;
  root.setAttribute("data-testid", "auto-layout-overlay");
  root.setAttribute("aria-label", "Vision Control Auto Layout");
  root.style.display = "none";
  shadowRoot.appendChild(root);

  const axisHost = doc.createElement("div");
  axisHost.className = "vc-auto-layout-axis-host";
  axisHost.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483644;";
  shadowRoot.appendChild(axisHost);
  const axis: FlexGridAxis = createFlexGridAxis(axisHost);

  let active = false;
  let current: { element: Element; ref: AutoLayoutElementRef } | null = null;
  let gapGesture: GapGesture | null = null;
  const cleanups: Array<() => void> = [];

  const emit = (operation: Operation): void => {
    previewManager.applyOperation(operation);
    bus.send("panel", createInspectorEditMessage(operation));
  };

  const clearChrome = (): void => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
    gapGesture?.dispose();
    gapGesture = null;
    root.innerHTML = "";
    axis.clear();
  };

  const hide = (): void => {
    clearChrome();
    current = null;
    root.style.display = "none";
  };

  const applyCommand = (
    command: AutoLayoutCommand,
    container: AutoLayoutContainerContext,
    previousValues: Readonly<Record<string, string>>,
    childRef?: AutoLayoutElementRef,
  ): void => {
    if (current === null) return;
    const result = buildAutoLayoutOperations({
      command,
      container,
      containerRef: current.ref,
      origin: "canvas-drag",
      previousValues,
      ...(childRef !== undefined ? { childRef } : {}),
    });
    if (!result.ok) return;
    for (const operation of result.operations) {
      emit(operation);
    }
  };

  const childRefAt = (element: Element, index: number): AutoLayoutElementRef | undefined => {
    const child = element.children.item(index);
    if (child === null) return undefined;
    const runtimeId = getOrAssignPreviewRuntimeId(child);
    registerElement(runtimeId, child);
    return { runtimeId };
  };

  const renderUnsupported = (): void => {
    clearChrome();
    const msg = doc.createElement("p");
    msg.className = "vc-auto-layout__diagnostic";
    msg.setAttribute("data-testid", "auto-layout-overlay-unsupported");
    msg.textContent = "Select a flex or grid container";
    root.appendChild(msg);
    root.style.display = "";
  };

  const renderSupported = (element: Element): void => {
    clearChrome();
    const ok = renderSupportedPanel({
      document: doc,
      root,
      element,
      axisHost,
      axis,
      applyCommand,
      childRefAt,
      trackCleanup: (cleanup) => {
        cleanups.push(cleanup);
      },
      setGapGesture: (gesture) => {
        gapGesture = gesture;
      },
    });
    if (!ok) renderUnsupported();
  };

  const render = (): void => {
    if (current === null) {
      hide();
      return;
    }
    const display = doc.defaultView?.getComputedStyle(current.element).display ?? "";
    if (!isFlexOrGridDisplay(display)) {
      renderUnsupported();
      return;
    }
    renderSupported(current.element);
  };

  const showFor = (element: Element, elementRef: AutoLayoutElementRef): void => {
    current = { element, ref: elementRef };
    if (!active) {
      root.style.display = "none";
      return;
    }
    render();
  };

  const setActive = (next: boolean): void => {
    active = next;
    if (!active) {
      root.style.display = "none";
      axis.clear();
      gapGesture?.dispose();
      gapGesture = null;
      return;
    }
    if (current !== null) render();
  };

  const dispose = (): void => {
    clearChrome();
    current = null;
    active = false;
    root.remove();
    axisHost.remove();
    style.remove();
  };

  return { showFor, hide, setActive, dispose };
}
