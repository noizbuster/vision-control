/**
 * Inspector orchestration.
 *
 * Owns selection/hover state, drives the overlay to render outlines, reads DOM
 * data through the adapter, and notifies the panel via a bus abstraction. This
 * module is the only place that wires overlay-ui and inspector-core together.
 */

import { createOperationId } from "@vision-control/change-ir";
import {
  computeFingerprint,
  createRuntimeId,
  type ElementRef,
  generateStableSelector,
  type SelectionIdentity,
  toSelectionIdentity,
} from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import {
  bridgeRectToTopFrame,
  createKeyboardController,
  createPositionObserver,
  type KeyboardController,
  type OverlayElement,
  type OverlayRoot,
  type PositionObserver,
} from "@vision-control/overlay-ui";
import type { DomAdapter } from "./dom-adapter.js";
import { buildSelectionSummary, type SelectionSummary } from "./selection-summary.js";
import { computeSourceConfidence } from "./source-confidence.js";

/** Bus abstraction used by the inspector to report selection changes. */
export interface InspectorBus {
  readonly sendSelection: (identity: SelectionIdentity, summary: SelectionSummary) => void;
  readonly sendDeselect: () => void;
}

/** Options for constructing an {@link Inspector}. */
export interface InspectorOptions {
  readonly overlayRoot: OverlayRoot;
  readonly overlayElement: OverlayElement;
  readonly domAdapter: DomAdapter;
  readonly bus: InspectorBus;
}

/** State machine for the inspector. */
export type InspectorMode = "idle" | "inspect" | "selected";

/** API returned by {@link createInspector}. */
export interface Inspector {
  readonly getMode: () => InspectorMode;
  readonly setInspectMode: (active: boolean) => void;
  readonly hover: (target: Element | null) => void;
  readonly select: (target: Element) => void;
  readonly deselect: () => void;
  readonly confirm: () => void;
  readonly cycleParent: () => void;
  readonly cycleChild: () => void;
  readonly sync: () => void;
  readonly dispose: () => void;
  /** The keyboard controller (PRD §8.3 mode management). */
  readonly getKeyboardController: () => KeyboardController;
}

/**
 * Create an inspector that coordinates DOM reading, overlay rendering, and
 * panel notifications.
 */
export function createInspector(options: InspectorOptions): Inspector {
  const { overlayRoot, overlayElement, domAdapter, bus } = options;
  const runtimeIds = new WeakMap<Element, string>();
  let mode: InspectorMode = "idle";
  let selectedElement: Element | null = null;
  let hoveredElement: Element | null = null;

  const positionObserver: PositionObserver = createPositionObserver({
    onChange: () => sync(),
    onHidden: () => overlayElement.clear(),
    onVisible: () => sync(),
  });

  const keyboard: KeyboardController = createKeyboardController({
    onEscape: () => deselect(),
    onCycleChild: () => cycleChild(),
    onCycleParent: () => cycleParent(),
    onConfirm: () => confirm(),
  });

  const getMode = (): InspectorMode => mode;

  const setInspectMode = (active: boolean): void => {
    if (active) {
      mode = "inspect";
      keyboard.activate();
    } else {
      keyboard.deactivate();
      if (mode === "inspect") {
        mode = "idle";
      }
    }
  };

  const hover = (target: Element | null): void => {
    hoveredElement = target;
    if (selectedElement === null) {
      renderHover(target);
    }
  };

  const select = (target: Element): void => {
    selectedElement = target;
    mode = "selected";
    positionObserver.observe(target);
    renderSelection(target);
    notifySelection(target);
  };

  const deselect = (): void => {
    selectedElement = null;
    hoveredElement = null;
    mode = mode === "selected" ? "inspect" : mode;
    positionObserver.disconnect();
    overlayElement.clear();
    bus.sendDeselect();
  };

  const confirm = (): void => {
    const target = hoveredElement ?? selectedElement;
    if (target !== null) {
      select(target);
    }
  };

  const cycleParent = (): void => {
    const target = selectedElement ?? hoveredElement;
    if (target === null) return;
    const parent = domAdapter.getParent(target);
    if (parent !== null) {
      select(parent);
    }
  };

  const cycleChild = (): void => {
    const target = selectedElement ?? hoveredElement;
    if (target === null) return;
    const [firstChild] = domAdapter.getChildren(target);
    if (firstChild !== undefined) {
      select(firstChild);
    }
  };

  const sync = (): void => {
    if (selectedElement !== null) {
      renderSelection(selectedElement);
    } else if (hoveredElement !== null) {
      renderHover(hoveredElement);
    }
  };

  const dispose = (): void => {
    keyboard.deactivate();
    positionObserver.disconnect();
    overlayElement.clear();
    overlayRoot.unmount();
  };

  function renderHover(target: Element | null): void {
    if (target === null) {
      overlayElement.setHover(null);
      return;
    }
    const rect = bridgeElementRect(target, domAdapter);
    if (rect.ok) {
      overlayElement.setHover(rect.value);
    }
  }

  function renderSelection(target: Element): void {
    const rect = bridgeElementRect(target, domAdapter);
    if (!rect.ok) {
      overlayElement.clear();
      return;
    }

    const elementData = domAdapter.getElementData(target);
    const descriptor = domAdapter.getDescriptor(target);
    const selector = generateStableSelector({ descriptor });
    const confidence = computeSourceConfidence({
      attributes: elementData.attributes,
      id: elementData.id,
      className: elementData.className,
      role: elementData.role,
      selector,
    });

    overlayElement.setSelection({
      rect: rect.value,
      label: `${elementData.tagName}${selector ? ` · ${selector}` : ""}`,
      confidence,
    });
  }

  function notifySelection(target: Element): void {
    const descriptor = domAdapter.getDescriptor(target);
    const selector = generateStableSelector({ descriptor });
    const elementData = domAdapter.getElementData(target);
    const ref: ElementRef = {
      runtimeId: getRuntimeId(target),
      sourceId: elementData.attributes["data-vc-source"],
      selector,
      tagName: elementData.tagName,
      role: elementData.role,
      name: elementData.name,
    };
    const identity = toSelectionIdentity(ref, {
      frameId: "main",
      fingerprint: computeFingerprint(descriptor),
      confidence: computeSourceConfidence({
        attributes: elementData.attributes,
        id: elementData.id,
        className: elementData.className,
        role: elementData.role,
        selector,
      }),
    });
    const summary = buildSelectionSummary(target, domAdapter, identity);
    bus.sendSelection(identity, summary);
  }

  function getRuntimeId(element: Element): string {
    const existing = runtimeIds.get(element);
    if (existing !== undefined) return existing;
    const id = createRuntimeId(`runtime-${createOperationId()}`);
    runtimeIds.set(element, id);
    return id;
  }

  return {
    getMode,
    setInspectMode,
    hover,
    select,
    deselect,
    confirm,
    cycleParent,
    cycleChild,
    sync,
    dispose,
    getKeyboardController: () => keyboard,
  };
}

function bridgeElementRect(
  target: Element,
  domAdapter: DomAdapter,
): { readonly ok: true; readonly value: Rect } | { readonly ok: false } {
  const rect = domAdapter.getBoundingRect(target);
  const result = bridgeRectToTopFrame(new DOMRect(rect.x, rect.y, rect.width, rect.height), target);
  if (!result.ok) return { ok: false };
  return { ok: true, value: result.value };
}
