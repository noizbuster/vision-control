import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLEX_NEIGHBOR_ID,
  FLEX_PRIMARY_ID,
  makeFlexPairOperation,
} from "./flex-resize.test-fixtures.js";
import { createPreviewTransaction } from "./index.js";
import {
  registerDiv,
  resetDispatchTestDom,
  setupDispatchTest,
} from "./operation-dispatch.test-fixtures.js";

describe("paired preview transaction", () => {
  beforeEach(resetDispatchTestDom);

  it("retains the final pointerup preview after commit until clearAll", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const transaction = manager.beginTransaction();
    transaction.begin();
    transaction.apply(makeFlexPairOperation());

    transaction.commit();

    expect(transaction.state).toBe("committed");
    expect(transaction.operations).toHaveLength(1);
    expect(manager.stylesheet.ruleCount()).toBe(2);
    expect(manager.activeCount).toBe(1);

    manager.clearAll();
    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(manager.activeCount).toBe(0);
  });

  it("rolls back both members as one transaction unit", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const transaction = manager.beginTransaction();
    transaction.begin();
    transaction.apply(makeFlexPairOperation());

    transaction.rollback();

    expect(transaction.state).toBe("rolled-back");
    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(manager.activeCount).toBe(0);
  });

  it("undo, redo, and clear operate on the aggregate preview", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const operation = makeFlexPairOperation();
    const undo = manager.applyOperation(operation);
    expect(manager.activeCount).toBe(1);

    undo();
    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(manager.activeCount).toBe(0);

    manager.applyOperation(operation);
    expect(manager.stylesheet.ruleCount()).toBe(2);
    expect(manager.activeCount).toBe(1);

    manager.clearAll();
    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(manager.activeCount).toBe(0);
  });

  it("repeated cancellation and stale rollback stay idempotent", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const cancel = manager.applyOperation(makeFlexPairOperation());

    cancel();
    cancel();
    manager.clearAll();
    cancel();

    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(manager.activeCount).toBe(0);
    expect(document.querySelector("style[data-vc-preview-stylesheet]")?.textContent ?? "").toBe("");
  });

  it("out-of-order replacement cancellation leaves activeCount and CSS consistent", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, FLEX_PRIMARY_ID);
    registerDiv(dom, FLEX_NEIGHBOR_ID);
    const cancelFirst = manager.applyOperation(makeFlexPairOperation());
    const cancelSecond = manager.applyOperation(
      makeFlexPairOperation({ primaryAfterBasis: "260px", neighborAfterBasis: "120px" }),
    );

    cancelFirst();
    expect(manager.activeCount).toBe(1);
    expect(document.head.textContent).toContain("flex-basis: 260px;");

    cancelSecond();
    expect(manager.activeCount).toBe(0);
    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(document.head.textContent).toBe("");
  });

  it("continues reverse cleanup after a rollback callback throws", () => {
    const first = vi.fn(() => {
      throw new Error("first rollback failed");
    });
    const second = vi.fn();
    let dispatchCount = 0;
    const transaction = createPreviewTransaction("tx-failure", {
      dispatch: () => {
        dispatchCount += 1;
        return dispatchCount === 1 ? first : second;
      },
    });
    transaction.begin();
    transaction.apply(makeFlexPairOperation());
    transaction.apply(makeFlexPairOperation({ primaryAfterBasis: "260px" }));

    expect(() => transaction.rollback()).toThrow("first rollback failed");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(transaction.state).toBe("rolled-back");
  });
});
