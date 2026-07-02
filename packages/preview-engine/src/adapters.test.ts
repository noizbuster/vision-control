/**
 * Adapter unit tests: style, class, text, structural (reorder/reparent),
 * and transform preview adapters.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  childTexts,
  makeClassAdd,
  makeClassRemove,
  makeClassReplace,
  makeReorder,
  makeReparent,
  makeStyleEdit,
  makeTextEdit,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import {
  applyClassPreview,
  applyStructuralPreview,
  applyStylePreview,
  applyTextPreview,
  applyTransformPreview,
  createBrowserPreviewDomAdapter,
  createStylesheetManager,
  type PreviewDomAdapter,
  type StylesheetManager,
} from "./index.js";

function freshAdapter(): { dom: PreviewDomAdapter; stylesheet: StylesheetManager } {
  const dom = createBrowserPreviewDomAdapter();
  const stylesheet = createStylesheetManager(dom);
  return { dom, stylesheet };
}

function regDiv(dom: PreviewDomAdapter, id: string, text?: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text ?? id;
  dom.registerElement(id, el);
  document.body.appendChild(el);
  return el;
}

describe("style adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style[data-vc-preview-stylesheet]").forEach((el) => {
      el.remove();
    });
    resetOpCounter();
  });

  it("applies CSS rule and rollback removes it", () => {
    const { dom, stylesheet } = freshAdapter();
    regDiv(dom, "rt-target001");
    const rollback = applyStylePreview(
      stylesheet,
      makeStyleEdit("rt-target001", "padding", "16px"),
    );
    expect(stylesheet.ruleCount()).toBe(1);
    rollback();
    expect(stylesheet.ruleCount()).toBe(0);
  });

  it("supports !important flag", () => {
    const { dom, stylesheet } = freshAdapter();
    regDiv(dom, "rt-target001");
    const op = makeStyleEdit("rt-target001", "color", "red");
    op.important = true;
    applyStylePreview(stylesheet, op);
    const style = document.querySelector("style[data-vc-preview-stylesheet]");
    expect(style?.textContent).toContain("!important");
  });
});

describe("class adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("adds class and rollback restores original", () => {
    const { dom } = freshAdapter();
    const el = regDiv(dom, "rt-target001");
    el.className = "base";
    const rollback = applyClassPreview(dom, makeClassAdd("rt-target001", "active"));
    expect(el.className).toBe("base active");
    rollback();
    expect(el.className).toBe("base");
  });

  it("removes class and rollback restores", () => {
    const { dom } = freshAdapter();
    const el = regDiv(dom, "rt-target001");
    el.className = "base active";
    const rollback = applyClassPreview(dom, makeClassRemove("rt-target001", "active"));
    expect(el.classList.contains("active")).toBe(false);
    rollback();
    expect(el.classList.contains("active")).toBe(true);
  });

  it("replaces class and rollback restores", () => {
    const { dom } = freshAdapter();
    const el = regDiv(dom, "rt-target001");
    el.className = "old-class";
    const rollback = applyClassPreview(
      dom,
      makeClassReplace("rt-target001", "old-class", "new-class"),
    );
    expect(el.classList.contains("new-class")).toBe(true);
    rollback();
    expect(el.classList.contains("old-class")).toBe(true);
  });

  it("returns noop when element not found", () => {
    const { dom } = freshAdapter();
    const rollback = applyClassPreview(dom, makeClassAdd("rt-missing001", "x"));
    expect(() => rollback()).not.toThrow();
  });
});

describe("text adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("replaces textContent and rollback restores", () => {
    const { dom } = freshAdapter();
    const el = regDiv(dom, "rt-target001", "original");
    const rollback = applyTextPreview(dom, makeTextEdit("rt-target001", "new text"));
    expect(el.textContent).toBe("new text");
    rollback();
    expect(el.textContent).toBe("original");
  });
});

describe("structural adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetOpCounter();
  });

  it("reorders: move index 2 to 0, rollback restores", () => {
    const { dom } = freshAdapter();
    const parent = document.createElement("div");
    dom.registerElement("rt-parent001", parent);
    document.body.appendChild(parent);

    for (const [id, label] of [
      ["rt-child0001", "A"],
      ["rt-child0002", "B"],
      ["rt-child0003", "C"],
    ] as const) {
      const child = document.createElement("div");
      child.textContent = label;
      dom.registerElement(id, child);
      parent.appendChild(child);
    }

    const rollback = applyStructuralPreview(dom, makeReorder("rt-parent001", "rt-child0003", 2, 0));
    expect(childTexts(parent)).toEqual(["C", "A", "B"]);
    rollback();
    expect(childTexts(parent)).toEqual(["A", "B", "C"]);
  });

  it("reparents across containers and rollback restores", () => {
    const { dom } = freshAdapter();
    const source = document.createElement("div");
    const target = document.createElement("div");
    dom.registerElement("rt-source0001", source);
    dom.registerElement("rt-target0001", target);
    document.body.append(source, target);

    const child = document.createElement("div");
    child.textContent = "X";
    dom.registerElement("rt-elem00001", child);
    source.appendChild(child);

    const rollback = applyStructuralPreview(
      dom,
      makeReparent("rt-elem00001", "rt-source0001", 0, "rt-target0001", 0),
    );
    expect(target.children.length).toBe(1);
    expect(source.children.length).toBe(0);
    rollback();
    expect(source.children.length).toBe(1);
    expect(target.children.length).toBe(0);
  });
});

describe("transform adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style[data-vc-preview-stylesheet]").forEach((el) => {
      el.remove();
    });
    resetOpCounter();
  });

  it("applies transform rule and rollback removes it", () => {
    const { dom, stylesheet } = freshAdapter();
    regDiv(dom, "rt-target001");
    const rollback = applyTransformPreview(stylesheet, {
      runtimeId: "rt-target001",
      translateX: 10,
      translateY: 20,
    });
    expect(stylesheet.ruleCount()).toBe(1);
    const style = document.querySelector("style[data-vc-preview-stylesheet]");
    expect(style?.textContent).toContain("transform: translate(10px, 20px)");
    rollback();
    expect(stylesheet.ruleCount()).toBe(0);
  });
});
