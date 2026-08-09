/**
 * On-page floating property inspector.
 *
 * Lives in the overlay's shadow DOM (content context). Renders compact
 * WYSIWYG controls for the selected element: tag/source header, class chips,
 * text content, and the most-used style controls. Each control change builds a
 * change-ir operation, applies it INSTANTLY through the content-side
 * {@link PreviewManager} (no panel round-trip for the preview), then forwards
 * the op to the panel via the `inspector-edit` bus message so the journal
 * records it. The panel records the op as already-committed and never
 * dispatches it back (the content applied locally), avoiding a double-apply.
 *
 * Undo/redo from the panel still travel the normal `editor-command` path
 * (panel -> background -> content -> previewManager), so the inspector only
 * owns the forward-edit path.
 */

import type { Operation } from "@vision-control/change-ir";
import {
  createClassAddCommand,
  createClassRemoveCommand,
  createStyleEditCommand,
  createTextEditCommand,
} from "@vision-control/inspector-core";
import type { PreviewManager } from "@vision-control/preview-engine";

import type { BusMessage, BusRoute } from "../messaging/index.js";
import { createInspectorEditMessage } from "../messaging/index.js";
import { makeDraggableFixedPanel } from "./draggable-panel.js";
import { appendAutoLayoutToPropertyInspector } from "./property-inspector-auto-layout.js";

/** Source marker attribute (matches integrations; enriches the op target). */
const SOURCE_ATTR = "data-vc-source";

/** Narrow bus seam: only `send` is needed to forward ops to the panel. */
export interface PropertyInspectorBus {
  readonly send: (
    targetRoute: BusRoute,
    message: Omit<BusMessage, "sourceRoute" | "targetRoute">,
  ) => void | Promise<void>;
}

export interface PropertyInspectorOptions {
  readonly document: Document;
  readonly shadowRoot: ShadowRoot;
  readonly previewManager: PreviewManager;
  readonly bus: PropertyInspectorBus;
  readonly registerElement?: (runtimeId: string, element: Element) => void;
}

/** Minimal element identity the inspector needs to build operation targets. */
export interface InspectorElementRef {
  readonly runtimeId: string;
  readonly sourceId?: string;
}

export interface PropertyInspector {
  readonly showFor: (element: Element, elementRef: InspectorElementRef) => void;
  readonly hide: () => void;
  readonly dispose: () => void;
}

const INSPECTOR_CLASS = "vc-inspector";
const TEXT_INPUT_CLASS = "vc-inspector__text-input";
const HEADER_DRAGGING_CLASS = "vc-inspector__header--dragging";

type StyleControlId =
  | "background-color"
  | "color"
  | "padding"
  | "margin"
  | "font-size"
  | "border-radius";

const LENGTH_UNITS = ["px", "rem", "em", "%", "vh", "vw"] as const;

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgba?\(([^)]+)\)/);
  if (match === null || match[1] === undefined) return "#000000";
  const parts = match[1].split(",").map((p) => p.trim());
  const nums = parts.slice(0, 3).map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) return "#000000";
  const hex = nums
    .map((n) => {
      const clamped = Math.max(0, Math.min(255, n));
      return clamped.toString(16).padStart(2, "0");
    })
    .join("");
  return `#${hex}`;
}

function parseLength(value: string): { value: string; unit: string } {
  const match = value.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (match === null || match[1] === undefined) return { value: "0", unit: "px" };
  const rawValue = match[1];
  const rawUnit = match[2] ?? "";
  const unit = rawUnit.length > 0 ? rawUnit : "px";
  return { value: rawValue, unit };
}

function isLeafTextElement(element: Element): boolean {
  if (element.children.length > 0) return false;
  return element.textContent !== null && element.textContent.trim().length > 0;
}

function readSourceId(element: Element): string | undefined {
  const direct = element.getAttribute(SOURCE_ATTR);
  if (direct !== null && direct.length > 0) return direct;
  return undefined;
}

// allow: SIZE_OK — this floating inspector still owns tightly coupled edit
// state, render sections, and listener cleanup. New drag behavior is extracted
// to draggable-panel.ts; future inspector changes should split section renderers.
export function createPropertyInspector(options: PropertyInspectorOptions): PropertyInspector {
  const { document: doc, shadowRoot, previewManager, bus } = options;
  const registerElement = options.registerElement ?? (() => {});

  const style = doc.createElement("style");
  style.textContent = INSPECTOR_CSS;
  shadowRoot.appendChild(style);

  const root = doc.createElement("div");
  root.className = INSPECTOR_CLASS;
  root.setAttribute("aria-label", "Vision Control property inspector");
  root.style.display = "none";
  shadowRoot.appendChild(root);

  let current: { element: Element; ref: InspectorElementRef } | null = null;
  const previousValues = new Map<StyleControlId, string>();
  let previousText = "";
  let collapsed = false;
  const listeners: Array<() => void> = [];

  const trackListener = (cleanup: () => void): void => {
    listeners.push(cleanup);
  };

  const applyCollapsedState = (): void => {
    root.classList.toggle("vc-inspector--collapsed", collapsed);
    const toggle = root.querySelector<HTMLButtonElement>("[data-collapse-toggle]");
    if (toggle === null) return;
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute("aria-label", collapsed ? "Expand inspector" : "Collapse inspector");
    toggle.textContent = collapsed ? "+" : "−";
  };

  const emit = (operation: Operation): void => {
    previewManager.applyOperation(operation);
    bus.send("panel", createInspectorEditMessage(operation));
  };

  const empty = (): void => {
    root.innerHTML = "";
    previousValues.clear();
    previousText = "";
    for (const cleanup of listeners) cleanup();
    listeners.length = 0;
  };

  const readControlValue = (control: StyleControlId): string => {
    if (control === "background-color" || control === "color") {
      const input = root.querySelector<HTMLInputElement>(
        `input[type="color"][data-control="${control}"]`,
      );
      return input?.value ?? "";
    }
    const numberInput = root.querySelector<HTMLInputElement>(
      `input[type="number"][data-control="${control}"]`,
    );
    const unitSelect = root.querySelector<HTMLSelectElement>(`select[data-control="${control}"]`);
    const num = numberInput?.value ?? "0";
    const unit = unitSelect?.value ?? "px";
    return `${num}${unit}`;
  };

  const applyStyleChange = (control: StyleControlId): void => {
    if (current === null) return;
    const next = readControlValue(control);
    const prev = previousValues.get(control) ?? "";
    if (next === prev) return;
    previousValues.set(control, next);
    emit(
      createStyleEditCommand(
        { runtimeId: current.ref.runtimeId, ...sourceIdOf(current.ref) },
        control,
        next,
        prev,
      ),
    );
  };

  const sourceIdOf = (ref: InspectorElementRef): { sourceId?: string } => {
    return ref.sourceId !== undefined ? { sourceId: ref.sourceId } : {};
  };

  const renderClassChips = (): void => {
    if (current === null) return;
    const chipsHost = root.querySelector<HTMLElement>("[data-chips-host]");
    if (chipsHost === null) return;
    chipsHost.innerHTML = "";
    const classes = Array.from(current.element.classList);
    if (classes.length === 0) {
      const emptyNote = doc.createElement("span");
      emptyNote.className = "vc-inspector__chip-empty";
      emptyNote.textContent = "no classes";
      chipsHost.appendChild(emptyNote);
      return;
    }
    for (const className of classes) {
      const chip = doc.createElement("span");
      chip.className = "vc-inspector__chip";
      const label = doc.createElement("span");
      label.className = "vc-inspector__chip-label";
      label.textContent = className;
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "vc-inspector__chip-remove";
      remove.setAttribute("aria-label", `Remove class ${className}`);
      remove.textContent = "x";
      const onRemove = (): void => {
        if (current === null) return;
        emit(
          createClassRemoveCommand(
            { runtimeId: current.ref.runtimeId, ...sourceIdOf(current.ref) },
            className,
          ),
        );
        renderClassChips();
      };
      remove.addEventListener("click", onRemove);
      trackListener(() => remove.removeEventListener("click", onRemove));
      chip.appendChild(label);
      chip.appendChild(remove);
      chipsHost.appendChild(chip);
    }
  };

  const renderHeader = (element: Element, ref: InspectorElementRef): void => {
    const header = doc.createElement("div");
    header.className = "vc-inspector__header";
    const title = doc.createElement("span");
    title.className = "vc-inspector__title";
    title.textContent = element.tagName.toLowerCase();
    header.appendChild(title);
    if (ref.sourceId !== undefined) {
      const badge = doc.createElement("span");
      badge.className = "vc-inspector__badge";
      badge.textContent = ref.sourceId;
      header.appendChild(badge);
    }
    const spacer = doc.createElement("span");
    spacer.className = "vc-inspector__header-spacer";
    header.appendChild(spacer);
    const collapseBtn = doc.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "vc-inspector__collapse";
    collapseBtn.setAttribute("data-collapse-toggle", "");
    collapseBtn.setAttribute("data-testid", "vc-inspector-collapse");
    const onToggle = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      collapsed = !collapsed;
      applyCollapsedState();
    };
    const stopDrag = (event: Event): void => {
      event.stopPropagation();
    };
    collapseBtn.addEventListener("click", onToggle);
    collapseBtn.addEventListener("pointerdown", stopDrag);
    trackListener(() => {
      collapseBtn.removeEventListener("click", onToggle);
      collapseBtn.removeEventListener("pointerdown", stopDrag);
    });
    header.appendChild(collapseBtn);
    const draggable = makeDraggableFixedPanel({
      panel: root,
      handle: header,
      draggingClassName: HEADER_DRAGGING_CLASS,
    });
    trackListener(draggable.dispose);
    root.appendChild(header);
  };

  const bodyHost = (): HTMLElement => {
    let body = root.querySelector<HTMLElement>("[data-inspector-body]");
    if (body === null) {
      body = doc.createElement("div");
      body.className = "vc-inspector__body";
      body.setAttribute("data-inspector-body", "");
      root.appendChild(body);
    }
    return body;
  };

  const renderClassSection = (parent: HTMLElement): void => {
    const section = doc.createElement("div");
    section.className = "vc-inspector__section";
    const label = doc.createElement("span");
    label.className = "vc-inspector__label";
    label.textContent = "classes";
    section.appendChild(label);
    const chipsHost = doc.createElement("div");
    chipsHost.className = "vc-inspector__chips";
    chipsHost.setAttribute("data-chips-host", "");
    section.appendChild(chipsHost);
    const addRow = doc.createElement("div");
    addRow.className = "vc-inspector__add-row";
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "vc-inspector__input";
    input.placeholder = "add class…";
    input.setAttribute("data-class-input", "");
    const addButton = doc.createElement("button");
    addButton.type = "button";
    addButton.className = "vc-inspector__btn";
    addButton.textContent = "+";
    const commitAdd = (): void => {
      if (current === null) return;
      const trimmed = input.value.trim();
      if (trimmed.length === 0) return;
      emit(
        createClassAddCommand(
          { runtimeId: current.ref.runtimeId, ...sourceIdOf(current.ref) },
          trimmed,
        ),
      );
      input.value = "";
      renderClassChips();
    };
    addButton.addEventListener("click", commitAdd);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitAdd();
      }
    };
    input.addEventListener("keydown", onKey);
    trackListener(() => {
      addButton.removeEventListener("click", commitAdd);
      input.removeEventListener("keydown", onKey);
    });
    addRow.appendChild(input);
    addRow.appendChild(addButton);
    section.appendChild(addRow);
    parent.appendChild(section);
  };

  const renderTextSection = (parent: HTMLElement, element: Element): void => {
    if (!isLeafTextElement(element)) return;
    const section = doc.createElement("div");
    section.className = "vc-inspector__section";
    const label = doc.createElement("span");
    label.className = "vc-inspector__label";
    label.textContent = "text";
    section.appendChild(label);
    const textarea = doc.createElement("input");
    textarea.type = "text";
    textarea.className = `vc-inspector__input ${TEXT_INPUT_CLASS}`;
    textarea.setAttribute("data-text-input", "");
    previousText = element.textContent ?? "";
    textarea.value = previousText;
    const onInput = (): void => {
      if (current === null) return;
      const next = textarea.value;
      if (next === previousText) return;
      const prev = previousText;
      previousText = next;
      emit(
        createTextEditCommand(
          { runtimeId: current.ref.runtimeId, ...sourceIdOf(current.ref) },
          next,
          prev,
        ),
      );
    };
    textarea.addEventListener("input", onInput);
    trackListener(() => textarea.removeEventListener("input", onInput));
    section.appendChild(textarea);
    parent.appendChild(section);
  };

  const renderColorRow = (
    parent: HTMLElement,
    control: StyleControlId,
    labelText: string,
  ): void => {
    const computed = previousValues.get(control) ?? "";
    const row = doc.createElement("div");
    row.className = "vc-inspector__row";
    const label = doc.createElement("span");
    label.className = "vc-inspector__row-label";
    label.textContent = labelText;
    const input = doc.createElement("input");
    input.type = "color";
    input.className = "vc-inspector__color";
    input.setAttribute("data-control", control);
    input.value = rgbToHex(computed);
    const onInput = (): void => applyStyleChange(control);
    input.addEventListener("input", onInput);
    trackListener(() => input.removeEventListener("input", onInput));
    row.appendChild(label);
    row.appendChild(input);
    parent.appendChild(row);
  };

  const renderLengthRow = (
    parent: HTMLElement,
    control: StyleControlId,
    labelText: string,
  ): void => {
    const computed = previousValues.get(control) ?? "0px";
    const parsed = parseLength(computed);
    const row = doc.createElement("div");
    row.className = "vc-inspector__row";
    const label = doc.createElement("span");
    label.className = "vc-inspector__row-label";
    label.textContent = labelText;
    const numberInput = doc.createElement("input");
    numberInput.type = "number";
    numberInput.className = "vc-inspector__number";
    numberInput.setAttribute("data-control", control);
    numberInput.value = parsed.value;
    const unitSelect = doc.createElement("select");
    unitSelect.className = "vc-inspector__select";
    unitSelect.setAttribute("data-control", control);
    for (const unit of LENGTH_UNITS) {
      const option = doc.createElement("option");
      option.value = unit;
      option.textContent = unit;
      if (unit === parsed.unit) option.selected = true;
      unitSelect.appendChild(option);
    }
    const onInput = (): void => applyStyleChange(control);
    numberInput.addEventListener("input", onInput);
    unitSelect.addEventListener("change", onInput);
    trackListener(() => {
      numberInput.removeEventListener("input", onInput);
      unitSelect.removeEventListener("change", onInput);
    });
    row.appendChild(label);
    row.appendChild(numberInput);
    row.appendChild(unitSelect);
    parent.appendChild(row);
  };

  const renderStyleSection = (parent: HTMLElement, element: Element): void => {
    const computed = doc.defaultView?.getComputedStyle(element);
    if (computed === undefined) return;
    previousValues.set("background-color", rgbToHex(computed.backgroundColor));
    previousValues.set("color", rgbToHex(computed.color));
    previousValues.set("padding", computed.paddingTop);
    previousValues.set("margin", computed.marginTop);
    previousValues.set("font-size", computed.fontSize);
    previousValues.set("border-radius", computed.borderTopLeftRadius);
    const section = doc.createElement("div");
    section.className = "vc-inspector__section";
    const label = doc.createElement("span");
    label.className = "vc-inspector__label";
    label.textContent = "style";
    section.appendChild(label);
    parent.appendChild(section);
    renderColorRow(parent, "background-color", "bg");
    renderColorRow(parent, "color", "text");
    renderLengthRow(parent, "padding", "pad");
    renderLengthRow(parent, "margin", "margin");
    renderLengthRow(parent, "font-size", "font");
    renderLengthRow(parent, "border-radius", "radius");
  };

  const showFor = (element: Element, elementRef: InspectorElementRef): void => {
    empty();
    const enrichedSourceId = elementRef.sourceId ?? readSourceId(element);
    const ref: InspectorElementRef = {
      runtimeId: elementRef.runtimeId,
      ...(enrichedSourceId !== undefined ? { sourceId: enrichedSourceId } : {}),
    };
    current = { element, ref };
    renderHeader(element, ref);
    const body = bodyHost();
    renderClassSection(body);
    renderClassChips();
    renderTextSection(body, element);
    renderStyleSection(body, element);
    appendAutoLayoutToPropertyInspector({
      document: doc,
      shadowRoot,
      inspectorRoot: body,
      element,
      elementRef: ref,
      emit,
      registerElement,
      trackCleanup: trackListener,
    });
    applyCollapsedState();
    root.style.display = "";
  };

  const hide = (): void => {
    empty();
    current = null;
    root.style.display = "none";
  };

  const dispose = (): void => {
    empty();
    current = null;
    root.remove();
    style.remove();
  };

  return { showFor, hide, dispose };
}

const INSPECTOR_CSS = /* css */ `
  .${INSPECTOR_CLASS} {
    all: initial;
    position: fixed;
    top: 12px;
    right: 12px;
    width: 260px;
    max-height: 70vh;
    overflow-y: auto;
    box-sizing: border-box;
    pointer-events: auto;
    z-index: 2147483647;
    padding: 8px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 8px;
    background: oklch(18% 0.015 260);
    color: oklch(98% 0.005 260);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.3;
    box-shadow: 0 8px 24px oklch(0% 0 0 / 0.4);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .vc-inspector__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid oklch(28% 0.01 260);
    cursor: move;
    touch-action: none;
    user-select: none;
  }
  .vc-inspector__header--dragging {
    cursor: grabbing;
  }
  .vc-inspector__header > * {
    pointer-events: none;
  }
  .vc-inspector__header-spacer {
    flex: 1;
    min-width: 4px;
  }
  .vc-inspector__collapse {
    all: initial;
    pointer-events: auto;
    cursor: pointer;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(26% 0.02 260);
    color: oklch(90% 0.08 240);
    font-family: inherit;
    font-size: 12px;
    line-height: 1;
  }
  .vc-inspector__collapse:hover {
    border-color: oklch(50% 0.08 240);
    color: oklch(95% 0.1 240);
  }
  .vc-inspector__body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .vc-inspector--collapsed {
    width: auto;
    max-width: 220px;
    max-height: none;
    overflow: hidden;
  }
  .vc-inspector--collapsed .vc-inspector__header {
    padding-bottom: 0;
    border-bottom: none;
  }
  .vc-inspector--collapsed .vc-inspector__badge {
    display: none;
  }
  .vc-inspector--collapsed .vc-inspector__body {
    display: none;
  }
  .vc-inspector__title {
    font-weight: 600;
    color: oklch(85% 0.12 240);
  }
  .vc-inspector__badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: oklch(28% 0.02 260);
    color: oklch(80% 0.05 260);
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vc-inspector__section {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .vc-inspector__label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: oklch(65% 0.03 260);
  }
  .vc-inspector__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .vc-inspector__chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 3px 1px 5px;
    border-radius: 3px;
    background: oklch(26% 0.02 260);
  }
  .vc-inspector__chip-label {
    color: oklch(90% 0.08 240);
  }
  .vc-inspector__chip-remove {
    all: initial;
    cursor: pointer;
    color: oklch(70% 0.05 260);
    font-size: 10px;
    line-height: 1;
    padding: 0 2px;
  }
  .vc-inspector__chip-remove:hover {
    color: oklch(70% 0.22 25);
  }
  .vc-inspector__chip-empty {
    color: oklch(60% 0.02 260);
    font-style: italic;
  }
  .vc-inspector__add-row {
    display: flex;
    gap: 3px;
  }
  .vc-inspector__input {
    all: initial;
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(14% 0.01 260);
    color: oklch(98% 0.005 260);
    font-family: inherit;
    font-size: 11px;
  }
  .vc-inspector__input:focus {
    outline: 1px solid oklch(60% 0.2 260);
  }
  .vc-inspector__btn {
    all: initial;
    cursor: pointer;
    padding: 1px 6px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(28% 0.02 260);
    color: oklch(90% 0.08 240);
    font-family: inherit;
    font-size: 11px;
  }
  .vc-inspector__row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .vc-inspector__row-label {
    width: 38px;
    color: oklch(70% 0.03 260);
    flex-shrink: 0;
  }
  .vc-inspector__color {
    all: initial;
    width: 28px;
    height: 18px;
    padding: 0;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(14% 0.01 260);
    cursor: pointer;
  }
  .vc-inspector__number {
    all: initial;
    width: 48px;
    padding: 1px 3px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(14% 0.01 260);
    color: oklch(98% 0.005 260);
    font-family: inherit;
    font-size: 11px;
  }
  .vc-inspector__select {
    all: initial;
    width: 48px;
    padding: 1px 2px;
    border: 1px solid oklch(30% 0.02 260);
    border-radius: 3px;
    background: oklch(14% 0.01 260);
    color: oklch(98% 0.005 260);
    font-family: inherit;
    font-size: 11px;
  }
  .${TEXT_INPUT_CLASS} {
    width: 100%;
  }
`;
