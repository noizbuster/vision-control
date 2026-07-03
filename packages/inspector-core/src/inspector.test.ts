import type { OverlayElement, OverlayRoot } from "@vision-control/overlay-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserDomAdapter,
  createInspector,
  type DomAdapter,
  type ElementData,
  type InspectorBus,
} from "./index.js";

const mockObserver = (): object => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  unobserve: vi.fn(),
});

beforeEach(() => {
  // biome-ignore lint/complexity/useArrowFunction: must be constructible as a class
  globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
    return mockObserver();
  }) as unknown as typeof ResizeObserver;
  // biome-ignore lint/complexity/useArrowFunction: must be constructible as a class
  globalThis.IntersectionObserver = vi.fn().mockImplementation(function () {
    return mockObserver();
  }) as unknown as typeof IntersectionObserver;
});

function createFakeOverlay(): {
  readonly root: OverlayRoot;
  readonly element: OverlayElement;
  readonly calls: unknown[];
} {
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const calls: unknown[] = [];

  const element: OverlayElement = {
    setHover: (rect) => calls.push({ method: "setHover", rect }),
    setSelection: (state) => calls.push({ method: "setSelection", state }),
    setDropIndicator: (rect) => calls.push({ method: "setDropIndicator", rect }),
    setResizeHandles: (rect) => calls.push({ method: "setResizeHandles", rect }),
    getResizeHandle: () => null,
    updateResizeHandleCursor: () => calls.push({ method: "updateResizeHandleCursor" }),
    clear: () => calls.push({ method: "clear" }),
  };

  return {
    root: { host, shadowRoot, unmount: () => host.remove() },
    element,
    calls,
  };
}

function fakeDomAdapter(overrides?: Partial<DomAdapter>): DomAdapter {
  const elementData: ElementData = {
    tagName: "button",
    id: "primary",
    className: "btn primary",
    attributes: { "data-vc-source": "src/Button.tsx:12", type: "submit" },
    boundingRect: { x: 10, y: 20, width: 100, height: 40 },
    computedStyle: {
      display: "inline-block",
      position: "static",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
      flexBasis: "auto",
      flexGrow: "0",
      width: "100px",
      height: "40px",
      paddingTop: "0px",
      paddingRight: "0px",
      paddingBottom: "0px",
      paddingLeft: "0px",
      marginTop: "0px",
      marginRight: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      borderTopWidth: "0px",
      borderRightWidth: "0px",
      borderBottomWidth: "0px",
      borderLeftWidth: "0px",
      borderTopStyle: "none",
      borderTopColor: "rgb(0, 0, 0)",
      color: "rgb(0, 0, 0)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "normal",
    },
    role: "button",
    name: "Save",
    parent: null,
    children: [],
  };

  return {
    getElementData: () => elementData,
    getDescriptor: () => ({
      tagName: "button",
      id: "primary",
      className: "btn primary",
      attributes: elementData.attributes,
      ancestry: [{ tagName: "body" }],
    }),
    getBoundingRect: () => elementData.boundingRect,
    getComputedStyle: () => elementData.computedStyle,
    getParent: () => null,
    getChildren: () => [],
    getScrollParents: () => [],
    ...overrides,
  };
}

function createFakeBus(): { readonly bus: InspectorBus; readonly messages: unknown[] } {
  const messages: unknown[] = [];
  return {
    bus: {
      sendSelection: (identity, summary) => messages.push({ type: "selection", identity, summary }),
      sendDeselect: () => messages.push({ type: "deselect" }),
    },
    messages,
  };
}

describe("inspector", () => {
  it("selects an element and notifies the bus", () => {
    const overlay = createFakeOverlay();
    const { bus, messages } = createFakeBus();
    const inspector = createInspector({
      overlayRoot: overlay.root,
      overlayElement: overlay.element,
      domAdapter: fakeDomAdapter(),
      bus,
    });

    const target = document.createElement("button");
    document.body.appendChild(target);

    inspector.select(target);

    expect(
      overlay.calls.some((call) => (call as { method: string }).method === "setSelection"),
    ).toBe(true);
    const selectionMessage = messages.find((m) => (m as { type: string }).type === "selection");
    expect(selectionMessage).toBeDefined();

    inspector.dispose();
  });

  it("deselects and clears the overlay on Escape", () => {
    const overlay = createFakeOverlay();
    const { bus, messages } = createFakeBus();
    const inspector = createInspector({
      overlayRoot: overlay.root,
      overlayElement: overlay.element,
      domAdapter: fakeDomAdapter(),
      bus,
    });

    const target = document.createElement("button");
    document.body.appendChild(target);

    inspector.select(target);
    inspector.deselect();

    expect(overlay.calls[overlay.calls.length - 1]).toEqual({ method: "clear" });
    expect(messages[messages.length - 1]).toEqual({ type: "deselect" });

    inspector.dispose();
  });

  it("cycles selection to the parent", () => {
    const parent = document.createElement("section");
    const child = document.createElement("button");
    parent.appendChild(child);
    document.body.appendChild(parent);

    const overlay = createFakeOverlay();
    const { bus, messages } = createFakeBus();
    const adapter = createBrowserDomAdapter();
    const inspector = createInspector({
      overlayRoot: overlay.root,
      overlayElement: overlay.element,
      domAdapter: adapter,
      bus,
    });

    inspector.select(child);
    inspector.cycleParent();

    const selectionMessages = messages.filter((m) => (m as { type: string }).type === "selection");
    const last = selectionMessages[selectionMessages.length - 1] as {
      identity: { tagName: string };
    };
    expect(last.identity.tagName).toBe("section");

    inspector.dispose();
  });

  it("cycles selection to the first child", () => {
    const parent = document.createElement("section");
    const child = document.createElement("button");
    parent.appendChild(child);
    document.body.appendChild(parent);

    const overlay = createFakeOverlay();
    const { bus, messages } = createFakeBus();
    const adapter = createBrowserDomAdapter();
    const inspector = createInspector({
      overlayRoot: overlay.root,
      overlayElement: overlay.element,
      domAdapter: adapter,
      bus,
    });

    inspector.select(parent);
    inspector.cycleChild();

    const selectionMessages = messages.filter((m) => (m as { type: string }).type === "selection");
    const last = selectionMessages[selectionMessages.length - 1] as {
      identity: { tagName: string };
    };
    expect(last.identity.tagName).toBe("button");

    inspector.dispose();
  });
});
