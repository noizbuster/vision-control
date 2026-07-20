/**
 * Unit tests for the on-page Auto Layout overlay (Layout interaction mode).
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
  type AutoLayoutOverlay,
  type AutoLayoutOverlayBus,
  createAutoLayoutOverlay,
} from "./auto-layout-overlay.js";

interface Harness {
  readonly host: HTMLElement;
  readonly shadowRoot: ShadowRoot;
  readonly previewDom: PreviewDomAdapter;
  readonly previewManager: PreviewManager;
  readonly bus: AutoLayoutOverlayBus & { readonly sent: readonly BusMessage[] };
  readonly overlay: AutoLayoutOverlay;
}

const RUNTIME_ID = "vc-auto-layout-container-1";

function createHarness(): Harness {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const previewDom = createBrowserPreviewDomAdapter();
  const previewManager = createPreviewManager({ dom: previewDom });
  const sent: BusMessage[] = [];
  const bus: AutoLayoutOverlayBus & { readonly sent: readonly BusMessage[] } = {
    send: (_route, message) => {
      sent.push(message as BusMessage);
    },
    get sent(): readonly BusMessage[] {
      return sent;
    },
  };
  const overlay = createAutoLayoutOverlay({
    document,
    shadowRoot,
    previewManager,
    bus,
    registerElement: (runtimeId, element) => {
      previewDom.registerElement(runtimeId, element);
    },
  });
  return { host, shadowRoot, previewDom, previewManager, bus, overlay };
}

function overlayRoot(harness: Harness): HTMLElement {
  const el = harness.shadowRoot.querySelector<HTMLElement>('[data-testid="auto-layout-overlay"]');
  if (el === null) throw new Error("auto-layout overlay root missing");
  return el;
}

function lastInspectorEdit(harness: Harness): Operation | null {
  const matches = harness.bus.sent.filter((m) => m.messageType === "inspector-edit");
  const latest = matches[matches.length - 1];
  return latest === undefined ? null : (latest.payload as Operation);
}

function previewStylesheet(): HTMLStyleElement | null {
  return document.head.querySelector<HTMLStyleElement>("style[data-vc-preview-stylesheet]");
}

function makeFlexContainer(): HTMLElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = "row";
  el.style.gap = "4px";
  const a = document.createElement("span");
  a.textContent = "A";
  const b = document.createElement("span");
  b.textContent = "B";
  el.append(a, b);
  document.body.appendChild(el);
  return el;
}

describe("auto-layout overlay", () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    harness = createHarness();
  });

  afterEach(() => {
    harness?.overlay.dispose();
    harness?.previewManager.clearAll();
    harness?.host.remove();
    harness = null;
  });

  it("stays hidden until Layout mode is active", () => {
    const h = harness;
    if (h === null) return;
    const el = makeFlexContainer();
    h.previewDom.registerElement(RUNTIME_ID, el);
    h.overlay.showFor(el, { runtimeId: RUNTIME_ID });
    expect(overlayRoot(h).style.display).toBe("none");

    h.overlay.setActive(true);
    expect(overlayRoot(h).style.display).toBe("");
    expect(
      overlayRoot(h).querySelector('[data-testid="auto-layout-overlay-direction"]'),
    ).not.toBeNull();
  });

  it("shows unsupported diagnostic for non flex/grid selection", () => {
    const h = harness;
    if (h === null) return;
    const el = document.createElement("p");
    el.style.display = "block";
    document.body.appendChild(el);
    h.previewDom.registerElement(RUNTIME_ID, el);
    h.overlay.setActive(true);
    h.overlay.showFor(el, { runtimeId: RUNTIME_ID });
    const msg = overlayRoot(h).querySelector('[data-testid="auto-layout-overlay-unsupported"]');
    expect(msg?.textContent).toMatch(/flex or grid/i);
  });

  it("direction change applies preview and journals with origin canvas-drag", () => {
    const h = harness;
    if (h === null) return;
    const el = makeFlexContainer();
    h.previewDom.registerElement(RUNTIME_ID, el);
    h.overlay.setActive(true);
    h.overlay.showFor(el, { runtimeId: RUNTIME_ID });

    const select = overlayRoot(h).querySelector<HTMLSelectElement>(
      '[data-testid="auto-layout-overlay-direction"]',
    );
    if (select === null) throw new Error("direction select missing");
    select.value = "column";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const sheet = previewStylesheet();
    expect(sheet, "preview stylesheet must be injected").not.toBeNull();
    expect(sheet?.textContent ?? "").toContain("flex-direction");
    expect(sheet?.textContent ?? "").toContain("column");

    const op = lastInspectorEdit(h);
    expect(op, "inspector-edit must be sent").not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("set-container-layout");
    expect((op as { property: string }).property).toBe("flex-direction");
    expect((op as { value: string }).value).toBe("column");
    expect((op as { origin: string }).origin).toBe("canvas-drag");
    expect((op as { container: { runtimeId: string } }).container.runtimeId).toBe(RUNTIME_ID);
  });

  it("gap apply builds set-container-layout gap op", () => {
    const h = harness;
    if (h === null) return;
    const el = makeFlexContainer();
    h.previewDom.registerElement(RUNTIME_ID, el);
    h.overlay.setActive(true);
    h.overlay.showFor(el, { runtimeId: RUNTIME_ID });

    const input = overlayRoot(h).querySelector<HTMLInputElement>(
      '[data-testid="auto-layout-overlay-gap"]',
    );
    const apply = overlayRoot(h).querySelector<HTMLButtonElement>(
      '[data-testid="auto-layout-overlay-gap-apply"]',
    );
    if (input === null || apply === null) throw new Error("gap controls missing");
    input.value = "16px";
    apply.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const op = lastInspectorEdit(h);
    expect(op).not.toBeNull();
    if (op === null) return;
    expect(op.kind).toBe("set-container-layout");
    expect((op as { property: string }).property).toBe("gap");
    expect((op as { value: string }).value).toBe("16px");
    expect((op as { origin: string }).origin).toBe("canvas-drag");
  });

  it("hide clears the chrome", () => {
    const h = harness;
    if (h === null) return;
    const el = makeFlexContainer();
    h.previewDom.registerElement(RUNTIME_ID, el);
    h.overlay.setActive(true);
    h.overlay.showFor(el, { runtimeId: RUNTIME_ID });
    expect(overlayRoot(h).style.display).toBe("");
    h.overlay.hide();
    expect(overlayRoot(h).style.display).toBe("none");
  });
});
