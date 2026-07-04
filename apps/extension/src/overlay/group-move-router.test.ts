/**
 * Group-move router integration tests (plan task 3).
 *
 * TDD order: these tests were written first. Before the router + wiring
 * existed, `reparentGroup` had ZERO callers and `reorderGroup` had no group
 * feed, so every assertion below failed. They go green once
 * `createGroupMoveRouter` is wired into `InteractionControllers.groupMove`.
 *
 * The tests exercise the router through the real `createInteractionControllers`
 * wiring (journal funnel + bus forward) so the assertion is on the recorded
 * operation, not a mock. PRD constraint 2 / D41 is asserted on the rejection
 * message shape.
 */

import type { Operation } from "@vision-control/change-ir";
import { createMultiSelectGroup, type MultiSelectGroup } from "@vision-control/editor-core";
import {
  createMultiSelectGroupId,
  type ElementRef,
  type MultiSelectMember,
} from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import {
  attachOverlayRoot,
  createOverlayElement,
  type OverlayElement,
  type OverlayRoot,
} from "@vision-control/overlay-ui";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  PREVIEW_ID_ATTR,
  type PreviewManager,
} from "@vision-control/preview-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusMessage, BusMessageHandler, BusRoute } from "../messaging/index.js";
import type { GroupDragIntent, GroupMoveRouteResult } from "./group-move-router.js";
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
  readonly emit: (messageType: string, payload: unknown) => void;
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
  const emit = (messageType: string, payload: unknown): void => {
    const message = {
      protocolVersion: "1.0.0",
      messageId: `test-${messageType}-${sent.length}`,
      messageType,
      sourceRoute: "content",
      targetRoute: "panel",
      payload,
      timestamp: Date.now(),
    } as BusMessage;
    for (const handler of handlers.get(messageType) ?? []) {
      handler(message, { route: "content" });
    }
  };

  return { send, on, sent, emit };
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

const STUB_RECT: Rect = { x: 0, y: 0, width: 40, height: 40 };

function stampId(element: Element, runtimeId: string): void {
  element.setAttribute(PREVIEW_ID_ATTR, runtimeId);
}

function buildMember(runtimeId: string, tagName: string): MultiSelectMember {
  return {
    runtimeId,
    tagName,
    frameId: "main",
    frameKind: "top",
    shadowKind: "light-dom",
  };
}

function buildGroup(
  members: readonly MultiSelectMember[],
  parentChains: readonly (readonly ElementRef[])[],
): MultiSelectGroup {
  const result = createMultiSelectGroup({
    id: createMultiSelectGroupId(`vc-group-test-${crypto.randomUUID()}`),
    members,
    memberRects: members.map(() => STUB_RECT),
    parentChains,
  });
  if (!result.ok) {
    throw new Error(`group constraints failed: ${JSON.stringify(result.violations)}`);
  }
  return result.group;
}

function interactionOperationMessages(
  bus: ReturnType<typeof createFakeBus>,
): readonly BusMessage[] {
  return bus.sent
    .filter((entry) => entry.message.messageType === "interaction-operation")
    .map((entry) => entry.message);
}

describe("group-move router (plan task 3)", () => {
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

  it("routes a same-parent group drag to reorder.reorderGroup and records group-reorder", () => {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    stampId(parent, "parent-1");
    const m1 = document.createElement("div");
    const m2 = document.createElement("div");
    stampId(m1, "member-a");
    stampId(m2, "member-b");
    parent.append(m1, m2);
    document.body.appendChild(parent);

    const parentRef: ElementRef = { runtimeId: "parent-1", tagName: "div" };
    const group = buildGroup(
      [buildMember("member-a", "div"), buildMember("member-b", "div")],
      [[parentRef], [parentRef]],
    );
    controllers.groupMove.setGroup(group);

    const intent: GroupDragIntent = {
      sourceParent: parentRef,
      targetParent: parentRef,
      sourceIndices: [0, 1],
      targetIndices: [1, 0],
      newOrder: [1, 0],
      sourceParentRole: "flex-container",
      targetParentRole: "flex-container",
    };

    const result = controllers.groupMove.route(intent);

    expect(result.kind).toBe("routed");
    const operations = controllers.getRecordedOperations();
    const reorderOp = operations.find((op) => op.kind === "group-reorder");
    expect(reorderOp, "same-parent group drag must record a group-reorder operation").toBeDefined();

    const panelMessages = interactionOperationMessages(bus);
    expect(
      panelMessages.some((m) => (m.payload as Operation).kind === "group-reorder"),
      "group-reorder must be forwarded to the panel bus",
    ).toBe(true);
  });

  it("routes a cross-parent group drag to reparent.reparentGroup and records group-reparent", () => {
    const source = document.createElement("div");
    const target = document.createElement("div");
    stampId(source, "src-parent");
    stampId(target, "tgt-parent");
    const m1 = document.createElement("div");
    const m2 = document.createElement("div");
    stampId(m1, "reparent-a");
    stampId(m2, "reparent-b");
    source.append(m1, m2);
    document.body.append(source, target);

    const sourceRef: ElementRef = { runtimeId: "src-parent", tagName: "div" };
    const targetRef: ElementRef = { runtimeId: "tgt-parent", tagName: "div" };
    const group = buildGroup(
      [buildMember("reparent-a", "div"), buildMember("reparent-b", "div")],
      [[sourceRef], [sourceRef]],
    );
    controllers.groupMove.setGroup(group);

    const intent: GroupDragIntent = {
      sourceParent: sourceRef,
      targetParent: targetRef,
      sourceIndices: [0, 1],
      targetIndices: [0, 1],
      newOrder: [0, 1],
      sourceParentRole: "normal-flow-block",
      targetParentRole: "normal-flow-block",
    };

    const result = controllers.groupMove.route(intent);

    expect(result.kind).toBe("routed");
    const operations = controllers.getRecordedOperations();
    const reparentOp = operations.find((op) => op.kind === "group-reparent");
    expect(
      reparentOp,
      "cross-parent group drag must record a group-reparent operation",
    ).toBeDefined();
    if (result.kind === "routed") {
      expect(result.operation.kind).toBe("group-reparent");
    }
  });

  it("D41: rejects a positioned-context group free-move and the message never matches /position:\\s*absolute/i", () => {
    const source = document.createElement("div");
    stampId(source, "d41-src");
    const m1 = document.createElement("div");
    const m2 = document.createElement("div");
    stampId(m1, "d41-a");
    stampId(m2, "d41-b");
    source.append(m1, m2);
    document.body.appendChild(source);

    const sourceRef: ElementRef = { runtimeId: "d41-src", tagName: "div" };
    const group = buildGroup(
      [buildMember("d41-a", "div"), buildMember("d41-b", "div")],
      [[sourceRef], [sourceRef]],
    );
    controllers.groupMove.setGroup(group);

    const intent: GroupDragIntent = {
      sourceParent: sourceRef,
      targetParent: sourceRef,
      sourceIndices: [0, 1],
      targetIndices: [0, 1],
      newOrder: [0, 1],
      sourceParentRole: "absolute-positioned",
      targetParentRole: "absolute-positioned",
      sourceContextPositioned: true,
      targetContextPositioned: true,
    };

    const result = controllers.groupMove.route(intent);

    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.message).not.toMatch(/position:\s*absolute/i);
      expect(result.message.length).toBeGreaterThan(0);
    }

    const operations = controllers.getRecordedOperations();
    expect(
      operations.filter((op) => op.kind === "group-reorder" || op.kind === "group-reparent"),
      "a D41-rejected group free-move must record NO group operation",
    ).toHaveLength(0);
  });

  it("returns no-group when no multi-select group is active", () => {
    const parentRef: ElementRef = { runtimeId: "orphan-parent", tagName: "div" };
    const intent: GroupDragIntent = {
      sourceParent: parentRef,
      targetParent: parentRef,
      sourceIndices: [0, 1],
      targetIndices: [1, 0],
      newOrder: [1, 0],
      sourceParentRole: "normal-flow-block",
      targetParentRole: "normal-flow-block",
    };

    const result = controllers.groupMove.route(intent);

    expect(result.kind).toBe("no-group");
    expect(controllers.getRecordedOperations()).toHaveLength(0);
  });

  it("stale_state: after clearing the group, a re-drag yields no-group (never a stale op)", () => {
    const parent = document.createElement("div");
    stampId(parent, "stale-parent");
    const m1 = document.createElement("div");
    const m2 = document.createElement("div");
    stampId(m1, "stale-a");
    stampId(m2, "stale-b");
    parent.append(m1, m2);
    document.body.appendChild(parent);

    const parentRef: ElementRef = { runtimeId: "stale-parent", tagName: "div" };
    const group = buildGroup(
      [buildMember("stale-a", "div"), buildMember("stale-b", "div")],
      [[parentRef], [parentRef]],
    );
    controllers.groupMove.setGroup(group);

    const intent: GroupDragIntent = {
      sourceParent: parentRef,
      targetParent: parentRef,
      sourceIndices: [0, 1],
      targetIndices: [1, 0],
      newOrder: [1, 0],
      sourceParentRole: "flex-container",
      targetParentRole: "flex-container",
    };

    const firstResult = controllers.groupMove.route(intent);
    expect(firstResult.kind).toBe("routed");

    controllers.groupMove.setGroup(null);
    const secondResult: GroupMoveRouteResult = controllers.groupMove.route(intent);
    expect(secondResult.kind).toBe("no-group");
  });

  it("bus subscription: a multi-select-group message caches the group on the router", () => {
    const parent = document.createElement("div");
    stampId(parent, "bus-parent");
    const m1 = document.createElement("div");
    const m2 = document.createElement("div");
    stampId(m1, "bus-a");
    stampId(m2, "bus-b");
    parent.append(m1, m2);
    document.body.appendChild(parent);

    const parentRef: ElementRef = { runtimeId: "bus-parent", tagName: "div" };
    const group = buildGroup(
      [buildMember("bus-a", "div"), buildMember("bus-b", "div")],
      [[parentRef], [parentRef]],
    );

    expect(controllers.groupMove.getGroup()).toBeNull();
    bus.emit("multi-select-group", group);
    expect(controllers.groupMove.getGroup()?.id).toBe(group.id);
  });
});
