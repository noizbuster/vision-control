/**
 * Grid-drag controller integration tests (plan task 4).
 *
 * TDD order: written first. Before the grid-drag controller was wired into
 * `InteractionControllers.gridDrag`, a CSS-Grid drag had no route to
 * `ReorderController.reorderGrid`, so no `grid-reorder` operation was recorded
 * and no a11y warning was surfaced. These tests go green once
 * `createGridDragController` is wired into the interaction controllers.
 *
 * The tests exercise the controller through the real `createInteractionControllers`
 * wiring (journal funnel + bus forward + onDiagnostic callback) so the assertion
 * is on the recorded operation and the surfaced diagnostic, not a mock. The
 * accessibility guard ("unset defaults to grid-area, never a silent DOM rewrite")
 * is asserted on the recorded operation's `placement` field.
 */

import type { Operation } from "@vision-control/change-ir";
import type { ElementRef } from "@vision-control/element-identity";
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
import type { ReorderDiagnostic } from "../components/interaction/ReorderController.js";
import type { BusMessage, BusMessageHandler, BusRoute } from "../messaging/index.js";
import type { GridDragIntent, GridDragRouteResult } from "./grid-drag-controller.js";
import {
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
      message: { ...message, sourceRoute: "content", targetRoute: route } as BusMessage,
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

function interactionOperationMessages(
  bus: ReturnType<typeof createFakeBus>,
): readonly BusMessage[] {
  return bus.sent
    .filter((entry) => entry.message.messageType === "interaction-operation")
    .map((entry) => entry.message);
}

const GRID_REF: ElementRef = { runtimeId: "grid-1", tagName: "div" };
const CHILD_REF: ElementRef = { runtimeId: "card-1", tagName: "div" };

describe("grid-drag controller (plan task 4)", () => {
  let bus: ReturnType<typeof createFakeBus>;
  let previewManager: PreviewManager;
  let overlay: ReturnType<typeof createOverlayFixture>;
  let controllers: InteractionControllers;
  let diagnostics: ReorderDiagnostic[];

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "<head></head><body></body>";
    installObserverMocks();
    bus = createFakeBus();
    previewManager = createPreviewManager({ dom: createBrowserPreviewDomAdapter() });
    overlay = createOverlayFixture(document);
    diagnostics = [];
    controllers = createInteractionControllers({
      overlayElement: overlay.overlayElement,
      overlayContainer: overlay.overlayContainer,
      previewManager,
      bus,
      onDiagnostic: (d) => {
        diagnostics.push(d);
      },
    });
  });

  afterEach(() => {
    controllers.dispose();
    overlay.root.unmount();
  });

  it("routes an unset-choice grid drag to a grid-area grid-reorder (NEVER a silent DOM rewrite)", () => {
    const intent: GridDragIntent = {
      grid: GRID_REF,
      child: CHILD_REF,
      fromIndex: 0,
      toIndex: 1,
      previousGridArea: "1 / 1 / 2 / 2",
      newGridArea: "1 / 2 / 2 / 3",
      accessibilitySemanticMatch: true,
      visualMatchesReadingOrder: false,
      // userChoice omitted -> defaults to "unset" -> grid-area
    };

    const result = controllers.gridDrag.route(intent);

    expect(result.kind).toBe("routed");
    if (result.kind === "routed") {
      expect(result.operation.kind).toBe("grid-reorder");
      expect(result.operation.placement).toBe("grid-area");
    }
  });

  it("records grid-reorder and forwards it to the panel bus", () => {
    const intent: GridDragIntent = {
      grid: GRID_REF,
      child: CHILD_REF,
      fromIndex: 0,
      toIndex: 1,
      newGridArea: "1 / 2 / 2 / 3",
      accessibilitySemanticMatch: true,
      visualMatchesReadingOrder: true,
    };

    controllers.gridDrag.route(intent);

    const operations = controllers.getRecordedOperations();
    const reorderOp = operations.find((op) => op.kind === "grid-reorder");
    expect(reorderOp, "grid drag must record a grid-reorder operation").toBeDefined();

    const panelMessages = interactionOperationMessages(bus);
    expect(
      panelMessages.some((m) => (m.payload as Operation).kind === "grid-reorder"),
      "grid-reorder must be forwarded to the panel bus",
    ).toBe(true);
  });

  it("surfaces the reading-order a11y warning via onDiagnostic when visual order desyncs", () => {
    const intent: GridDragIntent = {
      grid: GRID_REF,
      child: CHILD_REF,
      fromIndex: 0,
      toIndex: 1,
      newGridArea: "1 / 2 / 2 / 3",
      accessibilitySemanticMatch: true,
      visualMatchesReadingOrder: false, // desync -> warning expected
    };

    controllers.gridDrag.route(intent);

    const a11y = diagnostics.find((d) => d.kind === "grid-a11y-warning");
    expect(
      a11y,
      "a grid-area drag that desyncs reading order must surface an a11y warning",
    ).toBeDefined();
    if (a11y !== undefined) {
      expect(a11y.message).toMatch(/reading order|accessibility/i);
      expect(a11y.message).not.toMatch(/position:\s*absolute/i);
    }
  });

  it("explicit dom-order choice with matching a11y semantics records a dom-order grid-reorder", () => {
    const intent: GridDragIntent = {
      grid: GRID_REF,
      child: CHILD_REF,
      fromIndex: 0,
      toIndex: 2,
      newGridArea: "1 / 3 / 2 / 4",
      accessibilitySemanticMatch: true,
      visualMatchesReadingOrder: true,
      userChoice: "dom-order",
    };

    const result = controllers.gridDrag.route(intent);

    expect(result.kind).toBe("routed");
    if (result.kind === "routed") {
      expect(result.operation.placement).toBe("dom-order");
    }
  });

  it("rejects a dom-order choice when a11y semantics do not match", () => {
    const intent: GridDragIntent = {
      grid: GRID_REF,
      child: CHILD_REF,
      fromIndex: 0,
      toIndex: 1,
      newGridArea: "1 / 2 / 2 / 3",
      accessibilitySemanticMatch: false, // blocks the dom-order path
      visualMatchesReadingOrder: true,
      userChoice: "dom-order",
    };

    const result: GridDragRouteResult = controllers.gridDrag.route(intent);

    expect(result.kind).toBe("rejected");
    expect(controllers.getRecordedOperations()).toHaveLength(0);
  });

  it("stale_state: a rejected drag records nothing and leaves the journal clean", () => {
    // First route a valid grid-area drag (records 1 op).
    const valid: GridDragIntent = {
      grid: GRID_REF,
      child: CHILD_REF,
      fromIndex: 0,
      toIndex: 1,
      newGridArea: "1 / 2 / 2 / 3",
      accessibilitySemanticMatch: true,
      visualMatchesReadingOrder: true,
    };
    const firstResult = controllers.gridDrag.route(valid);
    expect(firstResult.kind).toBe("routed");
    expect(controllers.getRecordedOperations()).toHaveLength(1);

    // Then route a rejecting intent: dom-order requires matching semantics.
    const rejecting: GridDragIntent = {
      grid: GRID_REF,
      child: CHILD_REF,
      fromIndex: 1,
      toIndex: 2,
      newGridArea: "1 / 3 / 2 / 4",
      accessibilitySemanticMatch: false,
      visualMatchesReadingOrder: true,
      userChoice: "dom-order",
    };
    const secondResult: GridDragRouteResult = controllers.gridDrag.route(rejecting);

    expect(secondResult.kind).toBe("rejected");
    expect(
      controllers.getRecordedOperations(),
      "a rejected drag must not append to the journal",
    ).toHaveLength(1);
  });
});
