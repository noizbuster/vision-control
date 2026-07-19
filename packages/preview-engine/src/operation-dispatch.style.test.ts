import type { Operation } from "@vision-control/change-ir";
import { computeInverse } from "@vision-control/change-ir";
import { beforeEach, describe, expect, it } from "vitest";
import {
  makeBreakpointClassEdit,
  makeBreakpointStyleEdit,
  makeBreakpointTextEdit,
  makeGridSpan,
  makePositionElement,
  makePseudoStyleEdit,
  makeRemoveStyle,
  makeSetAttribute,
  makeSetChildSizing,
  makeSetContainerLayout,
} from "./__fixtures__/helpers.js";
import {
  registerDiv,
  resetDispatchTestDom,
  setupDispatchTest,
} from "./operation-dispatch.test-fixtures.js";

describe("style operation dispatch", () => {
  beforeEach(resetDispatchTestDom);

  it("applies CSS-rule operation kinds and clearAll removes every rule", () => {
    const { manager, dom } = setupDispatchTest();
    for (const runtimeId of [
      "rt-rmst001",
      "rt-pos0001",
      "rt-cont0001",
      "rt-chld0001",
      "rt-grch0001",
      "rt-bpse0001",
    ]) {
      registerDiv(dom, runtimeId);
    }

    const operations: Operation[] = [
      makeRemoveStyle("rt-rmst001", "color", "blue"),
      makePositionElement("rt-pos0001", "static", "absolute"),
      makeSetContainerLayout("rt-cont0001", "display", "flex"),
      makeSetChildSizing("rt-cont0001", "rt-chld0001", 0, "fill", "flex: 1"),
      makeGridSpan("rt-grch0001", "rt-grch0001", "column", 1, 3),
      makeBreakpointStyleEdit("rt-bpse0001", "md", "margin", "8px"),
    ];
    for (const operation of operations) manager.applyOperation(operation);

    expect(manager.stylesheet.ruleCount()).toBe(operations.length);
    manager.clearAll();
    expect(manager.stylesheet.ruleCount()).toBe(0);
  });

  it("set-attribute sets and rollback restores prior absence", () => {
    const { manager, dom } = setupDispatchTest();
    const element = registerDiv(dom, "rt-target001");

    const rollback = manager.applyOperation(makeSetAttribute("rt-target001", "aria-label", "x"));
    expect(element.getAttribute("aria-label")).toBe("x");

    rollback();
    expect(element.hasAttribute("aria-label")).toBe(false);
  });

  it("breakpoint-class-edit swaps a class", () => {
    const { manager, dom } = setupDispatchTest();
    const element = registerDiv(dom, "rt-target001");
    element.className = "old";

    const rollback = manager.applyOperation(
      makeBreakpointClassEdit("rt-target001", "md", "old", "new"),
    );
    expect(element.classList.contains("new")).toBe(true);

    rollback();
    expect(element.classList.contains("old")).toBe(true);
  });

  it("breakpoint-text-edit replaces text", () => {
    const { manager, dom } = setupDispatchTest();
    const element = registerDiv(dom, "rt-target001", "original");

    const rollback = manager.applyOperation(
      makeBreakpointTextEdit("rt-target001", "md", "changed"),
    );
    expect(element.textContent).toBe("changed");

    rollback();
    expect(element.textContent).toBe("original");
  });

  it("a ::before edit synthesizes a [data-vc-preview-id]::before rule", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-pseu0001");

    manager.applyOperation(makePseudoStyleEdit("rt-pseu0001", "::before", "content", '"NEW"'));

    expect(manager.stylesheet.ruleCount()).toBe(1);
    expect(manager.stylesheet.hasRule('[data-vc-preview-id="rt-pseu0001"]::before')).toBe(true);
  });

  it("round-trips: a pseudo-style-edit applies and rolls back a distinct rule", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-pseu0002");
    const forward = makePseudoStyleEdit("rt-pseu0002", "::after", "color", "red", "blue");

    const rollback = manager.applyOperation(forward);
    expect(manager.stylesheet.hasRule('[data-vc-preview-id="rt-pseu0002"]::after')).toBe(true);

    rollback();
    expect(manager.stylesheet.ruleCount()).toBe(0);
  });

  it("a :hover state edit synthesizes the state selector", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-pseu0003");

    manager.applyOperation(makePseudoStyleEdit("rt-pseu0003", ":hover", "color", "blue"));

    expect(manager.stylesheet.hasRule('[data-vc-preview-id="rt-pseu0003"]:hover')).toBe(true);
  });

  it("pseudo rollback removes the injected rule without leaking", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-pseu0004");
    const selector = '[data-vc-preview-id="rt-pseu0004"]::before';

    const rollback = manager.applyOperation(
      makePseudoStyleEdit("rt-pseu0004", "::before", "content", '"LEAK"'),
    );
    expect(document.querySelector("style[data-vc-preview-stylesheet]")?.textContent).toContain(
      selector,
    );

    rollback();
    expect(manager.stylesheet.hasRule(selector)).toBe(false);
    expect(document.querySelector("style[data-vc-preview-stylesheet]")?.textContent).not.toContain(
      selector,
    );
  });

  it("computeInverse re-dispatches pseudo style with the previous value", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-pseu0005");
    const forward = makePseudoStyleEdit("rt-pseu0005", "::after", "color", "red", "blue");

    manager.applyOperation(forward);
    const inverse = computeInverse(forward);
    expect(inverse.kind).toBe("pseudo-style-edit");
    manager.applyOperation(inverse);

    const css = document.querySelector("style[data-vc-preview-stylesheet]")?.textContent ?? "";
    expect(css).toContain("blue");
    expect(css).not.toContain("red");
  });

  it("pseudo preview does not leak past clearAll", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-pseu0006");
    manager.applyOperation(makePseudoStyleEdit("rt-pseu0006", "::before", "content", '"X"'));

    manager.clearAll();

    expect(manager.stylesheet.ruleCount()).toBe(0);
    expect(manager.activeCount).toBe(0);
  });
});
