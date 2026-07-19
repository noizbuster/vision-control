import type { Operation } from "@vision-control/change-ir";
import type {
  CandidateContainer,
  ReparentElementDescriptor,
} from "@vision-control/interaction-machine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReorderController } from "../components/interaction/ReorderController.js";
import {
  assertNoPositionElement,
  createInteractionHarness,
  type InteractionHarness,
  interactionOperationMessages,
  requireSelectionContext,
} from "./interaction-wiring.test-fixtures.js";

describe("interaction wiring operation recorder", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
  });
  afterEach(() => {
    harness.dispose();
  });

  it("instantiates every controller with an empty journal", () => {
    expect(harness.controllers.reorder).toBeInstanceOf(ReorderController);
    expect(harness.controllers.resize).toBeDefined();
    expect(harness.controllers.reparent).toBeDefined();
    expect(harness.controllers.getJournal().entries).toHaveLength(0);
    expect(harness.controllers.getRecordedOperations()).toHaveLength(0);
  });

  it("records keyboard reorder once in the journal and panel funnel", () => {
    const parent = document.createElement("div");
    parent.style.display = "flex";
    const createChild = (label: string): HTMLDivElement => {
      const child = document.createElement("div");
      child.textContent = label;
      parent.appendChild(child);
      return child;
    };
    createChild("a");
    const selected = createChild("b");
    createChild("c");
    document.body.appendChild(parent);
    harness.controllers.attach();
    harness.controllers.reorder.setSelectedElement(selected);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );

    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.kind).toBe("reorder-child");
    expect(harness.controllers.getJournal().entries).toHaveLength(1);
    expect(interactionOperationMessages(harness.bus)).toHaveLength(1);
    assertNoPositionElement(operations);
  });

  it("records a direct cross-container reparent result", () => {
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

    harness.controllers.reparent.begin("ptr-1", element, sourceParent, 0);
    harness.controllers.reparent.move(50, 50, [candidate]);
    expect(harness.controllers.reparent.end().status).toBe("committed");

    const operations = harness.controllers.getRecordedOperations();
    expect(operations.some((operation) => operation.kind === "reparent-element")).toBe(true);
    assertNoPositionElement(operations);
  });

  it("runs operation synchronization before publishing the panel message", () => {
    const sequence: string[] = [];
    const observed: Operation[] = [];
    harness.setOperationObserver((operation) => {
      sequence.push("sync");
      observed.push(operation);
    });
    const originalSend = harness.bus.send;
    vi.spyOn(harness.bus, "send").mockImplementation((route, message) => {
      if (message.messageType === "interaction-operation") sequence.push("publish");
      originalSend(route, message);
    });
    const parent = document.createElement("div");
    parent.style.display = "flex";
    const first = document.createElement("div");
    const second = document.createElement("div");
    parent.append(first, second);
    document.body.appendChild(parent);
    harness.controllers.attach();
    harness.controllers.onSelectionChange(requireSelectionContext(first));

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(observed).toHaveLength(1);
    expect(sequence).toEqual(["sync", "publish"]);
  });

  it("assigns runtime identity when crypto randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    const getRandomValues = (bytes: Uint8Array): Uint8Array => {
      bytes.fill(7);
      return bytes;
    };
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues },
    });
    try {
      const target = document.createElement("div");
      document.body.appendChild(target);
      expect(requireSelectionContext(target).elementRef.runtimeId).toMatch(/^vc-interaction-/);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });
});
