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
});
