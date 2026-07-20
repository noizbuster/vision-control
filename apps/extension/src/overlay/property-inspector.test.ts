/**
 * Unit tests for the on-page floating property inspector.
 *
 * Non-vacuous contract: every "applies" assertion checks the REAL DOM mutated
 * by the preview manager (stylesheet rule / classList / textContent), which can
 * only happen if previewManager.applyOperation was invoked. The journaling
 * assertion checks the inspector-edit bus message was sent. Fail if either side
 * is stubbed.
 */

import type { Operation } from "@vision-control/change-ir";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  type PreviewDomAdapter,
  type PreviewManager,
} from "@vision-control/preview-engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BusMessage } from "../messaging/index.js";
import {
  createPropertyInspector,
  type PropertyInspector,
  type PropertyInspectorBus,
} from "./property-inspector.js";

interface Harness {
  readonly host: HTMLElement;
  readonly shadowRoot: ShadowRoot;
  readonly previewDom: PreviewDomAdapter;
  readonly previewManager: PreviewManager;
  readonly bus: PropertyInspectorBus & { readonly sent: readonly BusMessage[] };
  readonly inspector: PropertyInspector;
}

function createHarness(): Harness {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const previewDom = createBrowserPreviewDomAdapter();
  const previewManager = createPreviewManager({ dom: previewDom });
  const sent: BusMessage[] = [];
  const bus: PropertyInspectorBus & { readonly sent: readonly BusMessage[] } = {
    send: (_route, message) => {
      sent.push(message as BusMessage);
    },
    get sent(): readonly BusMessage[] {
      return sent;
    },
  };
  const inspector = createPropertyInspector({
    document,
    shadowRoot,
    previewManager,
    bus,
  });
  return { host, shadowRoot, previewDom, previewManager, bus, inspector };
}

const RUNTIME_ID = "vc-test-element-1";

function selectElement(harness: Harness, element: Element): void {
  harness.previewDom.registerElement(RUNTIME_ID, element);
  harness.inspector.showFor(element, { runtimeId: RUNTIME_ID });
}

function inspectorEl(harness: Harness): HTMLElement {
  const el = harness.shadowRoot.querySelector<HTMLElement>(".vc-inspector");
  if (el === null) throw new Error("inspector root not rendered");
  return el;
}

function setAndFire(input: HTMLInputElement, value: string, eventType = "input"): void {
  input.value = value;
  input.dispatchEvent(new Event(eventType, { bubbles: true }));
}

function pointerEvent(type: string, init: MouseEventInit & { readonly pointerId: number }): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  return event;
}

function lastInspectorEdit(harness: Harness): Operation | null {
  const matches = harness.bus.sent.filter((m) => m.messageType === "inspector-edit");
  const latest = matches[matches.length - 1];
  return latest === undefined ? null : (latest.payload as Operation);
}

function previewStylesheet(): HTMLStyleElement | null {
  return document.head.querySelector<HTMLStyleElement>("style[data-vc-preview-stylesheet]");
}

describe("property inspector", () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    harness = createHarness();
  });

  afterEach(() => {
    harness?.inspector.dispose();
    harness?.previewManager.clearAll();
    harness?.host.remove();
    harness = null;
  });

  it("renders header tag name and is hidden until showFor", () => {
    const h = harness;
    if (h === null) return;
    expect(inspectorEl(h).style.display).toBe("none");

    const el = document.createElement("button");
    document.body.appendChild(el);
    selectElement(h, el);

    expect(inspectorEl(h).style.display).toBe("");
    expect(inspectorEl(h).querySelector(".vc-inspector__title")?.textContent).toBe("button");
  });

  it("collapse toggle hides body and keeps title; state survives re-select", () => {
    const h = harness;
    if (h === null) return;
    const first = document.createElement("div");
    first.setAttribute("data-vc-source", "src-a");
    document.body.appendChild(first);
    selectElement(h, first);

    const toggle = inspectorEl(h).querySelector<HTMLButtonElement>(
      '[data-testid="vc-inspector-collapse"]',
    );
    if (toggle === null) throw new Error("collapse toggle missing");
    expect(inspectorEl(h).classList.contains("vc-inspector--collapsed")).toBe(false);
    expect(inspectorEl(h).querySelector("[data-inspector-body]")).not.toBeNull();

    toggle.click();
    expect(inspectorEl(h).classList.contains("vc-inspector--collapsed")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("+");

    const second = document.createElement("span");
    document.body.appendChild(second);
    h.previewDom.registerElement("vc-test-element-2", second);
    h.inspector.showFor(second, { runtimeId: "vc-test-element-2" });

    expect(inspectorEl(h).classList.contains("vc-inspector--collapsed")).toBe(true);
    expect(inspectorEl(h).querySelector(".vc-inspector__title")?.textContent).toBe("span");
    expect(
      inspectorEl(h).querySelector<HTMLButtonElement>('[data-testid="vc-inspector-collapse"]')
        ?.textContent,
    ).toBe("+");

    inspectorEl(h)
      .querySelector<HTMLButtonElement>('[data-testid="vc-inspector-collapse"]')
      ?.click();
    expect(inspectorEl(h).classList.contains("vc-inspector--collapsed")).toBe(false);
  });

  it("background-color change applies via previewManager and journals a style-edit op", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("div");
    document.body.appendChild(el);
    selectElement(h, el);

    const colorInput = inspectorEl(h).querySelector<HTMLInputElement>(
      'input[type="color"][data-control="background-color"]',
    );
    if (colorInput === null) throw new Error("bg color input missing");

    setAndFire(colorInput, "#ff0000");

    const sheet = previewStylesheet();
    expect(sheet, "preview stylesheet must be injected").not.toBeNull();
    expect(sheet?.textContent ?? "").toContain("background-color");
    expect(sheet?.textContent ?? "").toContain("#ff0000");

    const op = lastInspectorEdit(h);
    expect(op, "inspector-edit message must be sent").not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("style-edit");
    expect((op as { target: { runtimeId: string } }).target.runtimeId).toBe(RUNTIME_ID);
    expect((op as { property: string }).property).toBe("background-color");
    expect((op as { value: string }).value).toBe("#ff0000");
  });

  it("font-size change builds a style-edit op with the resolved length value", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("span");
    document.body.appendChild(el);
    selectElement(h, el);

    const numberInput = inspectorEl(h).querySelector<HTMLInputElement>(
      'input[type="number"][data-control="font-size"]',
    );
    if (numberInput === null) throw new Error("font-size input missing");

    setAndFire(numberInput, "24");

    const op = lastInspectorEdit(h);
    expect(op).not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("style-edit");
    expect((op as { property: string }).property).toBe("font-size");
    expect((op as { value: string }).value).toBe("24px");
    expect(previewStylesheet()?.textContent ?? "").toContain("font-size: 24px");
  });

  it("adding a class applies class-add and mutates the element's classList", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("div");
    document.body.appendChild(el);
    selectElement(h, el);

    const classInput = inspectorEl(h).querySelector<HTMLInputElement>("input[data-class-input]");
    const addButton = inspectorEl(h).querySelector<HTMLButtonElement>(".vc-inspector__btn");
    if (classInput === null || addButton === null) throw new Error("class add row missing");

    setAndFire(classInput, "highlight");
    addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(el.classList.contains("highlight")).toBe(true);
    const op = lastInspectorEdit(h);
    expect(op).not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("class-add");
    expect((op as { className: string }).className).toBe("highlight");
  });

  it("removing a class chip builds a class-remove op and removes the class", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("div");
    el.className = "keepme dropme";
    document.body.appendChild(el);
    selectElement(h, el);

    const chips = inspectorEl(h).querySelectorAll<HTMLButtonElement>(".vc-inspector__chip-remove");
    const dropmeBtn = Array.from(chips).find(
      (c) => c.getAttribute("aria-label") === "Remove class dropme",
    );
    if (dropmeBtn === undefined) throw new Error("dropme chip remove button missing");

    expect(el.classList.contains("dropme")).toBe(true);
    dropmeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(el.classList.contains("dropme")).toBe(false);
    const op = lastInspectorEdit(h);
    expect(op).not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("class-remove");
    expect((op as { className: string }).className).toBe("dropme");
  });

  it("editing text builds a text-edit op and mutates textContent", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("p");
    el.textContent = "hello";
    document.body.appendChild(el);
    selectElement(h, el);

    const textInput = inspectorEl(h).querySelector<HTMLInputElement>("input[data-text-input]");
    if (textInput === null) throw new Error("text input missing for leaf element");

    setAndFire(textInput, "world");

    expect(el.textContent).toBe("world");
    const op = lastInspectorEdit(h);
    expect(op).not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("text-edit");
    expect((op as { newText: string }).newText).toBe("world");
  });

  it("does not render a text field for elements with child elements", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("section");
    const child = document.createElement("span");
    child.textContent = "nested";
    el.appendChild(child);
    document.body.appendChild(el);
    selectElement(h, el);

    expect(inspectorEl(h).querySelector("input[data-text-input]")).toBeNull();
  });

  it("hide() hides the inspector", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("div");
    document.body.appendChild(el);
    selectElement(h, el);
    expect(inspectorEl(h).style.display).toBe("");

    h.inspector.hide();
    expect(inspectorEl(h).style.display).toBe("none");
  });

  it("moves the floating inspector by dragging its element-name header", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("button");
    document.body.appendChild(el);
    selectElement(h, el);

    const panel = inspectorEl(h);
    panel.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 12,
        width: 260,
        height: 180,
        top: 12,
        right: 360,
        bottom: 192,
        left: 100,
        toJSON: () => ({}),
      }) satisfies DOMRect;
    const header = panel.querySelector<HTMLElement>(".vc-inspector__header");
    if (header === null) throw new Error("inspector header missing");

    header.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 120, clientY: 22 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 220, clientY: 102 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 220, clientY: 102 }));

    expect(panel.style.left).toBe("200px");
    expect(panel.style.top).toBe("92px");
    expect(panel.style.right).toBe("auto");
    expect(header.classList.contains("vc-inspector__header--dragging")).toBe(false);
  });

  it("keeps the dragged inspector position when a new element is selected", () => {
    const h = harness;
    if (h === null) return;
    const first = document.createElement("button");
    const second = document.createElement("a");
    document.body.appendChild(first);
    document.body.appendChild(second);
    selectElement(h, first);

    const panel = inspectorEl(h);
    panel.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 12,
        width: 260,
        height: 180,
        top: 12,
        right: 360,
        bottom: 192,
        left: 100,
        toJSON: () => ({}),
      }) satisfies DOMRect;
    const header = panel.querySelector<HTMLElement>(".vc-inspector__header");
    if (header === null) throw new Error("inspector header missing");

    header.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 120, clientY: 22 }));
    window.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 180, clientY: 72 }));
    window.dispatchEvent(pointerEvent("pointerup", { pointerId: 2, clientX: 180, clientY: 72 }));

    h.previewDom.registerElement("vc-test-element-2", second);
    h.inspector.showFor(second, { runtimeId: "vc-test-element-2" });

    expect(inspectorEl(h).style.left).toBe("160px");
    expect(inspectorEl(h).style.top).toBe("62px");
    expect(inspectorEl(h).querySelector(".vc-inspector__title")?.textContent).toBe("a");
  });

  it("re-selecting a different element repopulates the inspector from its computed state", () => {
    const h = harness;
    if (h === null) return;
    const first = document.createElement("div");
    document.body.appendChild(first);
    selectElement(h, first);

    const firstColor = inspectorEl(h).querySelector<HTMLInputElement>(
      'input[type="color"][data-control="color"]',
    );
    expect(firstColor?.value).toBe("#000000");

    const styledTag = document.createElement("a");
    styledTag.setAttribute("data-vc-source", "src-9");
    document.body.appendChild(styledTag);
    h.previewDom.registerElement("vc-test-element-2", styledTag);
    h.inspector.showFor(styledTag, { runtimeId: "vc-test-element-2" });

    const title = inspectorEl(h).querySelector(".vc-inspector__title")?.textContent;
    expect(title).toBe("a");
    const badge = inspectorEl(h).querySelector(".vc-inspector__badge")?.textContent;
    expect(badge).toBe("src-9");
  });

  it("does not double-apply: a no-op change (same value) emits nothing", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("div");
    document.body.appendChild(el);
    selectElement(h, el);

    const colorInput = inspectorEl(h).querySelector<HTMLInputElement>(
      'input[type="color"][data-control="background-color"]',
    );
    if (colorInput === null) throw new Error("bg color input missing");
    const initial = colorInput.value;
    setAndFire(colorInput, initial);

    expect(lastInspectorEdit(h)).toBeNull();
  });

  it("shows Auto Layout section inside vc-inspector for flex containers", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.flexDirection = "row";
    el.style.gap = "4px";
    el.append(document.createElement("span"), document.createElement("span"));
    document.body.appendChild(el);
    selectElement(h, el);

    const section = inspectorEl(h).querySelector('[data-testid="vc-inspector-auto-layout"]');
    expect(section).not.toBeNull();
    expect(
      inspectorEl(h).querySelector('[data-testid="auto-layout-overlay-direction"]'),
    ).not.toBeNull();
  });

  it("omits Auto Layout section for non flex/grid elements", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("p");
    el.style.display = "block";
    document.body.appendChild(el);
    selectElement(h, el);

    expect(inspectorEl(h).querySelector('[data-testid="vc-inspector-auto-layout"]')).toBeNull();
  });

  it("Auto Layout direction change journals set-container-layout from vc-inspector", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.flexDirection = "row";
    el.append(document.createElement("span"), document.createElement("span"));
    document.body.appendChild(el);
    selectElement(h, el);

    const select = inspectorEl(h).querySelector<HTMLSelectElement>(
      '[data-testid="auto-layout-overlay-direction"]',
    );
    if (select === null) throw new Error("direction select missing");
    select.value = "column";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const op = lastInspectorEdit(h);
    expect(op).not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("set-container-layout");
    expect((op as { property: string }).property).toBe("flex-direction");
    expect((op as { value: string }).value).toBe("column");
    expect((op as { origin: string }).origin).toBe("canvas-drag");
  });
});
