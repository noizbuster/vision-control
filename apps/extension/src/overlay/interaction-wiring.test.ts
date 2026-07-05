import type { Operation } from "@vision-control/change-ir";
import type {
  CandidateContainer,
  ReparentElementDescriptor,
} from "@vision-control/interaction-machine";
import {
  attachOverlayRoot,
  createOverlayElement,
  type OverlayElement,
  type OverlayRoot,
} from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  type PreviewManager,
} from "@vision-control/preview-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReorderController } from "../components/interaction/ReorderController.js";
import type { BusMessage, BusMessageHandler, BusRoute } from "../messaging/index.js";
import {
  buildSelectionContext,
  createInteractionControllers,
  type InteractionBus,
  type InteractionControllers,
} from "./interaction-wiring.js";

type SentMessage = { readonly route: BusRoute; readonly message: BusMessage };

function installObserverMocks(): void {
  const observerInstance = () => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  });
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
    return observerInstance();
  }) as unknown as typeof ResizeObserver;
  // biome-ignore lint/complexity/useArrowFunction: must be constructible
  globalThis.IntersectionObserver = vi.fn().mockImplementation(function () {
    return observerInstance();
  }) as unknown as typeof IntersectionObserver;
}

function createFakeBus(): InteractionBus & {
  readonly sent: SentMessage[];
} {
  const sent: SentMessage[] = [];
  const handlers = new Map<string, Set<BusMessageHandler>>();

  const send: InteractionBus["send"] = (route, message) => {
    sent.push({
      route,
      message: {
        ...message,
        sourceRoute: "content",
        targetRoute: route,
      } as BusMessage,
    });
  };
  const on: InteractionBus["on"] = (messageType, handler) => {
    let set = handlers.get(messageType);
    if (set === undefined) {
      set = new Set();
      handlers.set(messageType, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  };

  return { send, on, sent };
}

function createOverlayFixture(document: Document): {
  readonly root: OverlayRoot;
  readonly overlayElement: OverlayElement;
  readonly overlayContainer: HTMLElement;
} {
  const root = attachOverlayRoot(document);
  const overlayElement = createOverlayElement(root.shadowRoot);
  const overlayContainer = root.shadowRoot.querySelector<HTMLElement>(".vc-overlay-root");
  if (overlayContainer === null) {
    throw new Error("overlay root container not found");
  }
  return { root, overlayElement, overlayContainer };
}

function setRect(element: Element, x: number, y: number, width: number, height: number): void {
  vi.spyOn(element as HTMLElement, "getBoundingClientRect").mockReturnValue({
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect);
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function installCryptoWithoutRandomUUID(): () => void {
  const originalCrypto = globalThis.crypto;
  const cryptoWithoutRandomUuid = {
    getRandomValues: (bytes: Uint8Array): Uint8Array => {
      bytes.fill(7);
      return bytes;
    },
  };
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: cryptoWithoutRandomUuid,
  });
  return () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  };
}

function interactionOperationMessages(
  bus: ReturnType<typeof createFakeBus>,
): readonly BusMessage[] {
  return bus.sent
    .filter((entry) => entry.message.messageType === "interaction-operation")
    .map((entry) => entry.message);
}

function assertNoPositionElement(operations: readonly Operation[]): void {
  const violations = operations.filter((op) => op.kind === "position-element");
  expect(
    violations,
    "normal-flow drag must never emit position-element (PRD constraint 2)",
  ).toEqual([]);
}

describe("interaction wiring", () => {
  let bus: ReturnType<typeof createFakeBus>;
  let previewManager: PreviewManager;
  let overlay: ReturnType<typeof createOverlayFixture>;
  let controllers: InteractionControllers;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
    bus = createFakeBus();
    previewManager = createPreviewManager({ dom: createBrowserPreviewDomAdapter() });
    overlay = createOverlayFixture(document);
    controllers = createInteractionControllers({
      overlayElement: overlay.overlayElement,
      overlayContainer: overlay.overlayContainer,
      previewManager,
      bus,
    });
  });

  afterEach(() => {
    controllers.dispose();
    overlay.root.unmount();
  });

  it("instantiates all three controllers with an empty journal", () => {
    expect(controllers.reorder).toBeInstanceOf(ReorderController);
    expect(controllers.resize).toBeDefined();
    expect(controllers.reparent).toBeDefined();
    expect(controllers.getJournal().entries).toHaveLength(0);
    expect(controllers.getRecordedOperations()).toHaveLength(0);
  });

  it("records reorder-child when a flex child is reordered via keyboard (journal + bus)", () => {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    const children = ["a", "b", "c"].map((label) => {
      const child = document.createElement("div");
      child.textContent = label;
      parent.appendChild(child);
      return child;
    });
    document.body.appendChild(parent);

    controllers.attach();
    controllers.reorder.setSelectedElement(children[1] as Element);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );

    const operations = controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.kind).toBe("reorder-child");

    const panelMessages = interactionOperationMessages(bus);
    expect(panelMessages).toHaveLength(1);
    expect((panelMessages[0]?.payload as Operation).kind).toBe("reorder-child");

    assertNoPositionElement(operations);
  });

  it("records resize-element when a resize handle is dragged", async () => {
    const target = document.createElement("div");
    target.style.display = "block";
    target.style.width = "100px";
    document.body.appendChild(target);
    setRect(target, 10, 10, 100, 50);

    const context = buildSelectionContext(target);
    controllers.attach();
    controllers.onSelectionChange(context);

    const handle = overlay.overlayElement.getResizeHandle("e");
    expect(handle, "east resize handle should be rendered after attach").not.toBeNull();
    if (handle !== null) {
      handle.setPointerCapture = vi.fn();
      handle.releasePointerCapture = vi.fn();
    }

    handle?.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 110,
        clientY: 35,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    handle?.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 160,
        clientY: 35,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    await flushRaf();
    handle?.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 160,
        clientY: 35,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    const operations = controllers.getRecordedOperations();
    const resizeOp = operations.find((op) => op.kind === "resize-element");
    expect(resizeOp, "drag-resize should record a resize-element operation").toBeDefined();
    assertNoPositionElement(operations);
  });

  it("records reparent-element on a cross-container drop", () => {
    const element: ReparentElementDescriptor = {
      ref: { runtimeId: "child-1", tagName: "div" },
      tagName: "div",
    };
    const sourceParent: ReparentElementDescriptor = {
      ref: { runtimeId: "src-1", tagName: "div" },
      tagName: "div",
    };
    const targetParent: ReparentElementDescriptor = {
      ref: { runtimeId: "tgt-1", tagName: "div" },
      tagName: "div",
    };
    const candidate: CandidateContainer = {
      parent: targetParent,
      layoutRole: "normal-flow-block",
      rect: { x: 0, y: 0, width: 200, height: 200 },
      children: [],
    };

    controllers.reparent.begin("ptr-1", element, sourceParent, 0);
    controllers.reparent.move(50, 50, [candidate]);
    const result = controllers.reparent.end();

    expect(result.status).toBe("committed");
    const operations = controllers.getRecordedOperations();
    const reparentOp = operations.find((op) => op.kind === "reparent-element");
    expect(
      reparentOp,
      "cross-container drag should record a reparent-element operation",
    ).toBeDefined();
    assertNoPositionElement(operations);
  });

  it("records reparent-element when a selected element is dragged into another container", () => {
    const source = document.createElement("section");
    const target = document.createElement("section");
    const child = document.createElement("div");
    child.textContent = "child";
    source.appendChild(child);
    document.body.append(source, target);
    setRect(source, 0, 0, 120, 120);
    setRect(target, 200, 0, 160, 160);
    setRect(child, 10, 10, 60, 30);

    controllers.attach();
    controllers.onSelectionChange(buildSelectionContext(child));

    child.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 20,
        clientY: 20,
        pointerId: 9,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 240,
        clientY: 50,
        pointerId: 9,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 240,
        clientY: 50,
        pointerId: 9,
        bubbles: true,
        cancelable: true,
      }),
    );

    const operations = controllers.getRecordedOperations();
    const reparentOp = operations.find((op) => op.kind === "reparent-element");
    expect(reparentOp, "cross-container pointer drag should record reparent-element").toBeDefined();
    assertNoPositionElement(operations);
  });

  it("keeps same-parent pointer drags on the reorder path instead of reparent", () => {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    parent.style.flexDirection = "row";
    const first = document.createElement("div");
    first.textContent = "first";
    const second = document.createElement("div");
    second.textContent = "second";
    parent.append(first, second);
    document.body.appendChild(parent);
    setRect(parent, 0, 0, 180, 60);
    setRect(first, 0, 0, 60, 40);
    setRect(second, 70, 0, 60, 40);

    controllers.attach();
    controllers.onSelectionChange(buildSelectionContext(first));

    first.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 10,
        clientY: 20,
        pointerId: 10,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 100,
        clientY: 20,
        pointerId: 10,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 100,
        clientY: 20,
        pointerId: 10,
        bubbles: true,
        cancelable: true,
      }),
    );

    const operations = controllers.getRecordedOperations();
    expect(operations.some((op) => op.kind === "reorder-child")).toBe(true);
    expect(operations.some((op) => op.kind === "reparent-element")).toBe(false);
    assertNoPositionElement(operations);
  });

  it("never emits position-element for a normal-flow drag (PRD constraint 2 / D41)", () => {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    const first = document.createElement("div");
    first.textContent = "first";
    const second = document.createElement("div");
    second.textContent = "second";
    parent.append(first, second);
    document.body.appendChild(parent);

    controllers.attach();
    controllers.onSelectionChange(buildSelectionContext(first));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
    );

    const operations = controllers.getRecordedOperations();
    expect(operations.length, "at least one operation should be recorded").toBeGreaterThan(0);
    for (const op of operations) {
      expect(op.kind).not.toBe("position-element");
    }
    const kinds = new Set(operations.map((op) => op.kind));
    expect(kinds.has("position-element")).toBe(false);
  });

  it("Move mode on a normal-flow element emits reorder-child, never position-element (D41)", () => {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    parent.style.flexDirection = "row";
    const children = ["alpha", "beta", "gamma"].map((label) => {
      const child = document.createElement("div");
      child.textContent = label;
      parent.appendChild(child);
      return child;
    });
    document.body.appendChild(parent);

    controllers.attach();
    controllers.reorder.setSelectedElement(children[0] as Element);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );

    const operations = controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.kind).toBe("reorder-child");
    assertNoPositionElement(operations);
  });

  it("detach stops the reorder controller from recording", () => {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);

    controllers.attach();
    controllers.reorder.setSelectedElement(child);
    controllers.detach();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );

    expect(controllers.getRecordedOperations()).toHaveLength(0);
  });
});

describe("interaction wiring without crypto.randomUUID", () => {
  let overlay: ReturnType<typeof createOverlayFixture> | null = null;
  let controllers: InteractionControllers | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
  });

  afterEach(() => {
    controllers?.dispose();
    overlay?.root.unmount();
  });

  it("starts and records runtime IDs when randomUUID is unavailable", () => {
    const restoreCrypto = installCryptoWithoutRandomUUID();
    try {
      const bus = createFakeBus();
      const previewManager = createPreviewManager({ dom: createBrowserPreviewDomAdapter() });
      overlay = createOverlayFixture(document);

      controllers = createInteractionControllers({
        overlayElement: overlay.overlayElement,
        overlayContainer: overlay.overlayContainer,
        previewManager,
        bus,
      });

      const target = document.createElement("div");
      document.body.appendChild(target);
      const context = buildSelectionContext(target);

      expect(context.elementRef.runtimeId.startsWith("vc-interaction-")).toBe(true);
      expect(controllers.getJournal().entries).toHaveLength(0);
    } finally {
      restoreCrypto();
    }
  });
});
