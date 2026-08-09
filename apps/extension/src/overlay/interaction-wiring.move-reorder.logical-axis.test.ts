import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertNoPositionElement,
  createInteractionHarness,
  dispatchPointer,
  type InteractionHarness,
  requireSelectionContext,
  setRect,
} from "./interaction-wiring.test-fixtures.js";

type FlexFixture = {
  readonly parent: HTMLDivElement;
  readonly first: HTMLDivElement;
  readonly second: HTMLDivElement;
  readonly third: HTMLDivElement;
};

const makeHorizontalReverseFixture = (
  flexDirection: "row" | "row-reverse",
  direction: "ltr" | "rtl",
): FlexFixture => {
  const parent = document.createElement("div");
  parent.style.cssText = `display:flex;flex-direction:${flexDirection};direction:${direction};writing-mode:horizontal-tb`;
  const first = document.createElement("div");
  const second = document.createElement("div");
  const third = document.createElement("div");
  parent.append(first, second, third);
  document.body.appendChild(parent);
  setRect(parent, { x: 0, y: 0, width: 200, height: 60 });
  setRect(first, { x: 140, y: 0, width: 50, height: 40 });
  setRect(second, { x: 70, y: 0, width: 50, height: 40 });
  setRect(third, { x: 0, y: 0, width: 50, height: 40 });
  return { parent, first, second, third };
};

describe("interaction wiring logical-axis Move reorder", () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = createInteractionHarness();
    harness.controllers.attach();
  });

  afterEach(() => {
    harness.dispose();
  });

  it("moves the first DOM child to literal index 2 in a row-reverse container", () => {
    const { parent, first, second, third } = makeHorizontalReverseFixture("row-reverse", "ltr");
    harness.controllers.onSelectionChange(requireSelectionContext(first));

    dispatchPointer(first, "pointerdown", { clientX: 165, clientY: 20, pointerId: 31 });
    dispatchPointer(document, "pointermove", { clientX: 1, clientY: 20, pointerId: 31 });
    dispatchPointer(document, "pointerup", { clientX: 1, clientY: 20, pointerId: 31 });

    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("reorder-child");
    if (operation?.kind !== "reorder-child") return;
    expect(operation.fromIndex).toBe(0);
    expect(operation.toIndex).toBe(2);
    expect([...parent.children]).toEqual([second, third, first]);
  });

  it("moves the first DOM child to literal index 2 for RTL row progression", () => {
    const { parent, first, second, third } = makeHorizontalReverseFixture("row", "rtl");
    harness.controllers.onSelectionChange(requireSelectionContext(first));

    dispatchPointer(first, "pointerdown", { clientX: 165, clientY: 20, pointerId: 32 });
    dispatchPointer(document, "pointermove", { clientX: 1, clientY: 20, pointerId: 32 });
    dispatchPointer(document, "pointerup", { clientX: 1, clientY: 20, pointerId: 32 });

    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("reorder-child");
    if (operation?.kind !== "reorder-child") return;
    expect(operation.toIndex).toBe(2);
    expect([...parent.children]).toEqual([second, third, first]);
  });

  it("uses the physical Y axis for row flow in vertical-rl writing mode", () => {
    const parent = document.createElement("div");
    parent.style.cssText = "display:flex;flex-direction:row;direction:ltr;writing-mode:vertical-rl";
    const first = document.createElement("div");
    const second = document.createElement("div");
    const third = document.createElement("div");
    parent.append(first, second, third);
    document.body.appendChild(parent);
    setRect(parent, { x: 0, y: 0, width: 60, height: 200 });
    setRect(first, { x: 0, y: 0, width: 40, height: 50 });
    setRect(second, { x: 0, y: 70, width: 40, height: 50 });
    setRect(third, { x: 0, y: 140, width: 40, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(first));

    dispatchPointer(first, "pointerdown", { clientX: 20, clientY: 20, pointerId: 33 });
    dispatchPointer(document, "pointermove", { clientX: 20, clientY: 189, pointerId: 33 });
    dispatchPointer(document, "pointerup", { clientX: 20, clientY: 189, pointerId: 33 });

    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("reorder-child");
    if (operation?.kind !== "reorder-child") return;
    expect(operation.toIndex).toBe(2);
    expect([...parent.children]).toEqual([second, third, first]);
  });

  it("moves to literal index 2 in a column-reverse container", () => {
    const parent = document.createElement("div");
    parent.style.cssText =
      "display:flex;flex-direction:column-reverse;direction:ltr;writing-mode:horizontal-tb";
    const first = document.createElement("div");
    const second = document.createElement("div");
    const third = document.createElement("div");
    parent.append(first, second, third);
    document.body.appendChild(parent);
    setRect(parent, { x: 0, y: 0, width: 60, height: 200 });
    setRect(first, { x: 0, y: 140, width: 40, height: 50 });
    setRect(second, { x: 0, y: 70, width: 40, height: 50 });
    setRect(third, { x: 0, y: 0, width: 40, height: 50 });
    harness.controllers.onSelectionChange(requireSelectionContext(first));

    dispatchPointer(first, "pointerdown", { clientX: 20, clientY: 165, pointerId: 36 });
    dispatchPointer(document, "pointermove", { clientX: 20, clientY: 1, pointerId: 36 });
    dispatchPointer(document, "pointerup", { clientX: 20, clientY: 1, pointerId: 36 });

    const operation = harness.controllers.getRecordedOperations()[0];
    expect(operation?.kind).toBe("reorder-child");
    if (operation?.kind !== "reorder-child") return;
    expect(operation.toIndex).toBe(2);
    expect([...parent.children]).toEqual([second, third, first]);
  });

  it("rejects a mixed CSS-order boundary without recording a structural or position operation", () => {
    const { parent, first, second, third } = makeHorizontalReverseFixture("row", "ltr");
    second.style.order = "1";
    harness.controllers.onSelectionChange(requireSelectionContext(first));

    dispatchPointer(first, "pointerdown", { clientX: 10, clientY: 20, pointerId: 34 });
    dispatchPointer(document, "pointermove", { clientX: 180, clientY: 20, pointerId: 34 });
    dispatchPointer(document, "pointerup", { clientX: 180, clientY: 20, pointerId: 34 });

    const operations = harness.controllers.getRecordedOperations();
    expect(operations).toHaveLength(0);
    expect([...parent.children]).toEqual([first, second, third]);
    expect(harness.diagnostics).toContainEqual(
      expect.objectContaining({ code: "css-order-unrepresentable" }),
    );
    assertNoPositionElement(operations);
  });
});
