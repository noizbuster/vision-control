import type {
  BoxModelState,
  OverlayElement,
  OverlayRoot,
  SelectionOverlayState,
} from "@vision-control/overlay-ui";
import { beforeEach, describe, expect, it } from "vitest";

import { type ComputedStyleSnapshot, createInspector, type DomAdapter } from "./index.js";

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

type OverlayCall =
  | Readonly<{ method: "setHover"; rect: Rect | null }>
  | Readonly<{ method: "setSelection"; state: SelectionOverlayState | null }>
  | Readonly<{ method: "setBoxModel"; state: BoxModelState | null }>
  | Readonly<{ method: "clear" }>;

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly scrollMargin = "";
  readonly thresholds = [];

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: MockResizeObserver,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: MockIntersectionObserver,
  });
});

describe("inspector overlay synchronization", () => {
  it("keeps selected outline and box model attached after document scroll", () => {
    const overlay = createFakeOverlay();
    let rect: Rect = { x: 12, y: 24, width: 96, height: 32 };
    const inspector = createInspector({
      overlayRoot: overlay.root,
      overlayElement: overlay.element,
      domAdapter: fakeDomAdapter(() => rect),
      bus: { sendSelection: () => {}, sendDeselect: () => {} },
    });
    const target = document.createElement("button");
    document.body.appendChild(target);

    inspector.select(target);

    expect(requireSelectionCall(overlay.calls).state?.rect.y).toBe(24);
    expect(requireBoxModelCall(overlay.calls).state?.rect.y).toBe(24);

    rect = { x: 12, y: 78, width: 96, height: 32 };
    document.dispatchEvent(new Event("scroll"));

    expect(requireSelectionCall(overlay.calls).state?.rect.y).toBe(78);
    expect(requireBoxModelCall(overlay.calls).state?.rect.y).toBe(78);

    inspector.dispose();
  });

  it("shows hover box model and keeps it attached after scroll", () => {
    const overlay = createFakeOverlay();
    let rect: Rect = { x: 20, y: 30, width: 120, height: 48 };
    const inspector = createInspector({
      overlayRoot: overlay.root,
      overlayElement: overlay.element,
      domAdapter: fakeDomAdapter(() => rect),
      bus: { sendSelection: () => {}, sendDeselect: () => {} },
    });
    const target = document.createElement("button");
    document.body.appendChild(target);

    inspector.setInspectMode(true);
    inspector.hover(target);

    expect(requireHoverCall(overlay.calls).rect?.y).toBe(30);
    expect(requireBoxModelCall(overlay.calls).state).toMatchObject({
      rect: { y: 30 },
      margin: { top: 8, right: 6, bottom: 4, left: 2 },
      padding: { top: 10, right: 12, bottom: 14, left: 16 },
    });

    rect = { x: 20, y: 92, width: 120, height: 48 };
    document.dispatchEvent(new Event("scroll"));

    expect(requireHoverCall(overlay.calls).rect?.y).toBe(92);
    expect(requireBoxModelCall(overlay.calls).state?.rect.y).toBe(92);

    inspector.dispose();
  });
});

function createFakeOverlay(): {
  readonly root: OverlayRoot;
  readonly element: OverlayElement;
  readonly calls: OverlayCall[];
} {
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const calls: OverlayCall[] = [];
  const element: OverlayElement = {
    setHover: (rect) => calls.push({ method: "setHover", rect }),
    setSelection: (state) => calls.push({ method: "setSelection", state }),
    setBoxModel: (state) => calls.push({ method: "setBoxModel", state }),
    setDropIndicator: () => {},
    setResizeHandles: () => {},
    getResizeHandle: () => null,
    updateResizeHandleCursor: () => {},
    setParentOutline: () => {},
    setFlexPairFeedback: () => {},
    setFlexGridAxis: () => {},
    setRotationHandle: () => {},
    setChangedBadge: () => {},
    setDragGhost: () => {},
    clear: () => calls.push({ method: "clear" }),
  };

  return {
    root: { host, shadowRoot, unmount: () => host.remove() },
    element,
    calls,
  };
}

function fakeDomAdapter(readRect: () => Rect): DomAdapter {
  const computedStyle: ComputedStyleSnapshot = {
    display: "inline-block",
    position: "static",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    flexBasis: "auto",
    flexGrow: "0",
    width: "120px",
    height: "48px",
    paddingTop: "10px",
    paddingRight: "12px",
    paddingBottom: "14px",
    paddingLeft: "16px",
    marginTop: "8px",
    marginRight: "6px",
    marginBottom: "4px",
    marginLeft: "2px",
    borderTopWidth: "1px",
    borderRightWidth: "2px",
    borderBottomWidth: "3px",
    borderLeftWidth: "4px",
    borderTopStyle: "solid",
    borderTopColor: "rgb(0, 0, 0)",
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgba(0, 0, 0, 0)",
    fontSize: "16px",
    fontWeight: "400",
    lineHeight: "normal",
  };

  return {
    getElementData: (element) => ({
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      attributes: {},
      boundingRect: readRect(),
      computedStyle,
      role: undefined,
      name: undefined,
      parent: null,
      children: [],
    }),
    getDescriptor: (element) => ({
      tagName: element.tagName.toLowerCase(),
      attributes: {},
      ancestry: [],
    }),
    getBoundingRect: readRect,
    getComputedStyle: () => computedStyle,
    getParent: () => null,
    getChildren: () => [],
    getScrollParents: () => [],
  };
}

function requireHoverCall(
  calls: readonly OverlayCall[],
): Extract<OverlayCall, { method: "setHover" }> {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index];
    if (call !== undefined && call.method === "setHover") {
      return call;
    }
  }
  throw new Error("Expected overlay call setHover");
}

function requireSelectionCall(
  calls: readonly OverlayCall[],
): Extract<OverlayCall, { method: "setSelection" }> {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index];
    if (call !== undefined && call.method === "setSelection") {
      return call;
    }
  }
  throw new Error("Expected overlay call setSelection");
}

function requireBoxModelCall(
  calls: readonly OverlayCall[],
): Extract<OverlayCall, { method: "setBoxModel" }> {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index];
    if (call !== undefined && call.method === "setBoxModel") {
      return call;
    }
  }
  throw new Error("Expected overlay call setBoxModel");
}
