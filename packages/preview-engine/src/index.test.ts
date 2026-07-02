/**
 * Integration tests: transaction lifecycle, rollback fidelity, clearAll,
 * specificity conflict, and React reconciliation fallback.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  childTexts,
  createRecordingGhostRenderer,
  createTestDomAdapter,
  FakeMutationObserver,
  makeClassAdd,
  makeReorder,
  makeRuntimeStyleEdit,
  makeStyleEdit,
  makeTextEdit,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import {
  createBrowserPreviewDomAdapter,
  createPreviewManager,
  type GhostRenderer,
  type PreviewDomAdapter,
  type PreviewManager,
} from "./index.js";

function setup(opts?: { ghostRenderer?: GhostRenderer; computedStyleValue?: string }): {
  manager: PreviewManager;
  dom: PreviewDomAdapter;
} {
  const dom =
    opts?.computedStyleValue !== undefined
      ? createTestDomAdapter(FakeMutationObserver, opts.computedStyleValue)
      : createBrowserPreviewDomAdapter();
  const manager = createPreviewManager({
    dom,
    ...(opts?.ghostRenderer !== undefined ? { ghostRenderer: opts.ghostRenderer } : {}),
  });
  return { manager, dom };
}

function registerDiv(dom: PreviewDomAdapter, id: string, text?: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text ?? id;
  dom.registerElement(id, el);
  document.body.appendChild(el);
  return el;
}

describe("preview-engine integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
    FakeMutationObserver.instances.length = 0;
  });

  describe("transaction lifecycle", () => {
    it("begins pending, transitions through applying to applied", () => {
      const { manager, dom } = setup();
      registerDiv(dom, "rt-target001");
      const tx = manager.beginTransaction();
      expect(tx.state).toBe("pending");
      tx.begin();
      expect(tx.state).toBe("applying");
      tx.apply(makeStyleEdit("rt-target001", "color", "red"));
      expect(tx.state).toBe("applied");
    });

    it("rollback undoes ALL operations atomically", () => {
      const { manager, dom } = setup();
      const el = registerDiv(dom, "rt-target001", "hello");

      const tx = manager.beginTransaction();
      tx.begin();
      tx.apply(makeStyleEdit("rt-target001", "color", "red"));
      tx.apply(makeClassAdd("rt-target001", "active"));
      tx.apply(makeTextEdit("rt-target001", "world"));
      expect(el.classList.contains("active")).toBe(true);
      expect(el.textContent).toBe("world");

      tx.rollback();
      expect(tx.state).toBe("rolled-back");
      expect(manager.stylesheet.ruleCount()).toBe(0);
      expect(el.classList.contains("active")).toBe(false);
      expect(el.textContent).toBe("hello");
    });

    it("commit finalizes: operations stay applied, new transaction can begin", () => {
      const { manager, dom } = setup();
      const el = registerDiv(dom, "rt-target001");

      const tx1 = manager.beginTransaction();
      tx1.begin();
      tx1.apply(makeClassAdd("rt-target001", "committed"));
      tx1.commit();
      expect(tx1.state).toBe("committed");
      expect(el.classList.contains("committed")).toBe(true);

      const tx2 = manager.beginTransaction();
      tx2.begin();
      tx2.apply(makeClassAdd("rt-target001", "second"));
      tx2.rollback();
      expect(el.classList.contains("committed")).toBe(true);
      expect(el.classList.contains("second")).toBe(false);
    });

    it("throws on illegal state transitions", () => {
      const { manager, dom } = setup();
      registerDiv(dom, "rt-target001");
      const tx = manager.beginTransaction();
      expect(() => tx.apply(makeStyleEdit("rt-target001", "color", "red"))).toThrow();
      tx.begin();
      tx.commit();
      expect(() => tx.rollback()).toThrow();
    });
  });

  describe("clearAll", () => {
    it("removes all preview artifacts", () => {
      const { manager, dom } = setup();
      const parent = document.createElement("div");
      dom.registerElement("rt-parent001", parent);
      document.body.appendChild(parent);

      const childA = document.createElement("div");
      childA.textContent = "A";
      childA.id = "child-a";
      dom.registerElement("rt-child0001", childA);

      const childB = document.createElement("div");
      childB.textContent = "B";
      childB.id = "child-b";
      dom.registerElement("rt-child0002", childB);

      parent.appendChild(childA);
      parent.appendChild(childB);

      manager.applyOperation(makeStyleEdit("rt-child0001", "color", "red"));
      manager.applyOperation(makeClassAdd("rt-child0002", "hl"));
      manager.applyOperation(makeTextEdit("rt-child0001", "changed"));
      manager.applyOperation(makeReorder("rt-parent001", "rt-child0001", 0, 1));

      expect(manager.activeCount).toBe(4);
      expect(parent.children[1]?.id).toBe("child-a");

      manager.clearAll();

      expect(manager.activeCount).toBe(0);
      expect(manager.stylesheet.ruleCount()).toBe(0);
      expect(childTexts(parent)).toEqual(["A", "B"]);
      expect(childA.classList.contains("hl")).toBe(false);
      expect(childB.classList.contains("hl")).toBe(false);
    });
  });

  describe("specificity conflict detection", () => {
    it("emits diagnostic when computed value differs from expected", () => {
      const { manager, dom } = setup({ computedStyleValue: "8px" });
      registerDiv(dom, "rt-target001");

      manager.applyOperation(makeStyleEdit("rt-target001", "padding", "16px"));

      expect(manager.diagnostics).toHaveLength(1);
      const diag = manager.diagnostics[0];
      expect(diag?.kind).toBe("specificity-conflict");
      expect(diag?.property).toBe("padding");
      expect(diag?.expectedValue).toBe("16px");
      expect(diag?.actualValue).toBe("8px");
    });

    it("removes diagnostic on rollback", () => {
      const { manager, dom } = setup({ computedStyleValue: "8px" });
      registerDiv(dom, "rt-target001");

      const rollback = manager.applyOperation(makeStyleEdit("rt-target001", "padding", "16px"));
      expect(manager.diagnostics).toHaveLength(1);

      rollback();
      expect(manager.diagnostics).toHaveLength(0);
    });
  });

  describe("React reconciliation fallback", () => {
    it("switches to simulated ghost when framework reverts", () => {
      const { renderer, showCalls } = createRecordingGhostRenderer();
      const dom = createTestDomAdapter(FakeMutationObserver);
      const manager = createPreviewManager({ dom, ghostRenderer: renderer });

      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const child = document.createElement("div");
      child.textContent = "child";
      parent.appendChild(child);
      dom.registerElement("rt-parent001", parent);
      dom.registerElement("rt-child0001", child);

      manager.applyOperation(makeReorder("rt-parent001", "rt-child0001", 0, 0));
      expect(manager.hasSimulatedPreviews).toBe(false);

      const observer = FakeMutationObserver.instances.at(-1);
      observer?.simulateRemoval(child);

      expect(manager.hasSimulatedPreviews).toBe(true);
      expect(showCalls).toHaveLength(1);

      manager.clearAll();
      expect(manager.hasSimulatedPreviews).toBe(false);
    });
  });

  describe("runtime flag preservation", () => {
    it("preserves runtime:true through transaction", () => {
      const { manager, dom } = setup();
      registerDiv(dom, "rt-target001");

      const tx = manager.beginTransaction();
      tx.begin();
      tx.apply(makeRuntimeStyleEdit("rt-target001", "transform", "translate(10px, 20px)"));
      expect(tx.hasRuntimeMutation()).toBe(true);
      tx.rollback();
    });
  });
});
