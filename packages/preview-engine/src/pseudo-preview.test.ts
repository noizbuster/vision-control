/**
 * Pseudo-element preview tests (VC-V1V2-20) — TDD-first.
 *
 * Verifies: synthesized CSS rule insertion for ::before/::after and :hover,
 * rollback removes the rule, the preview selector never collides with a
 * regular style preview, and the computed-style assertion reads the actual
 * pseudo-element (not the host).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createBrowserPreviewDomAdapter,
  createStylesheetManager,
  type PreviewDomAdapter,
  type StylesheetManager,
} from "./index.js";
import {
  applyPseudoPreview,
  assertPseudoElementStyle,
  type PseudoPreviewInput,
  pseudoPreviewSelector,
} from "./pseudo-preview.js";

function freshSheet(): { dom: PreviewDomAdapter; stylesheet: StylesheetManager } {
  const dom = createBrowserPreviewDomAdapter();
  const stylesheet = createStylesheetManager(dom);
  return { dom, stylesheet };
}

function regDiv(dom: PreviewDomAdapter, id: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = id;
  dom.registerElement(id, el);
  document.body.appendChild(el);
  return el;
}

const before: PseudoPreviewInput = {
  runtimeId: "rt-target001",
  pseudoClass: "::before",
  property: "content",
  value: '"NEW"',
};

describe("applyPseudoPreview — synthesized CSS rule", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style[data-vc-preview-stylesheet]").forEach((el) => {
      el.remove();
    });
  });

  it("inserts a ::before rule and rollback removes it", () => {
    const { dom, stylesheet } = freshSheet();
    regDiv(dom, "rt-target001");
    const rollback = applyPseudoPreview(stylesheet, before);
    expect(stylesheet.ruleCount()).toBe(1);
    expect(stylesheet.hasRule(pseudoPreviewSelector("rt-target001", "::before"))).toBe(true);
    rollback();
    expect(stylesheet.ruleCount()).toBe(0);
  });

  it("the rule text targets the host element + pseudo class", () => {
    const { dom, stylesheet } = freshSheet();
    regDiv(dom, "rt-target001");
    applyPseudoPreview(stylesheet, before);
    const style = document.querySelector("style[data-vc-preview-stylesheet]");
    expect(style?.textContent).toContain('[data-vc-preview-id="rt-target001"]::before');
    expect(style?.textContent).toContain("content:");
    expect(style?.textContent).toContain('"NEW"');
  });

  it("supports !important", () => {
    const { dom, stylesheet } = freshSheet();
    regDiv(dom, "rt-target001");
    applyPseudoPreview(stylesheet, { ...before, important: true });
    const style = document.querySelector("style[data-vc-preview-stylesheet]");
    expect(style?.textContent).toContain("!important");
  });

  it("a ::before preview and a regular style preview coexist (no selector collision)", () => {
    const { dom, stylesheet } = freshSheet();
    regDiv(dom, "rt-target001");
    // Regular style preview uses the bare attribute selector.
    stylesheet.applyRule('[data-vc-preview-id="rt-target001"]', "color: red;");
    // Pseudo preview appends ::before — distinct key.
    applyPseudoPreview(stylesheet, before);
    expect(stylesheet.ruleCount()).toBe(2);
    expect(stylesheet.hasRule('[data-vc-preview-id="rt-target001"]')).toBe(true);
    expect(stylesheet.hasRule('[data-vc-preview-id="rt-target001"]::before')).toBe(true);
  });

  it("supports :hover state previews", () => {
    const { dom, stylesheet } = freshSheet();
    regDiv(dom, "rt-target002");
    applyPseudoPreview(stylesheet, {
      runtimeId: "rt-target002",
      pseudoClass: ":hover",
      property: "color",
      value: "blue",
    });
    expect(stylesheet.hasRule('[data-vc-preview-id="rt-target002"]:hover')).toBe(true);
  });

  it("supports ::after with a color edit", () => {
    const { dom, stylesheet } = freshSheet();
    regDiv(dom, "rt-target003");
    applyPseudoPreview(stylesheet, {
      runtimeId: "rt-target003",
      pseudoClass: "::after",
      property: "color",
      value: "red",
    });
    expect(stylesheet.hasRule('[data-vc-preview-id="rt-target003"]::after')).toBe(true);
  });
});

describe("pseudoPreviewSelector — pure selector builder", () => {
  it("builds a ::before selector", () => {
    expect(pseudoPreviewSelector("rt-x", "::before")).toBe('[data-vc-preview-id="rt-x"]::before');
  });

  it("builds a :hover selector", () => {
    expect(pseudoPreviewSelector("rt-x", ":hover")).toBe('[data-vc-preview-id="rt-x"]:hover');
  });
});

describe("assertPseudoElementStyle — verification against the actual pseudo-element", () => {
  it("passes when the pseudo-element computed value matches", () => {
    const fake = (_el: Element, _pseudo: string): CSSStyleDeclaration =>
      ({
        getPropertyValue: (p: string) => (p === "content" ? '"NEW"' : ""),
      }) as unknown as CSSStyleDeclaration;
    const el = document.createElement("div");
    const result = assertPseudoElementStyle(fake, el, "::before", "content", '"NEW"');
    expect(result.pass).toBe(true);
    expect(result.actual).toBe('"NEW"');
    expect(result.pseudoElement).toBe("::before");
  });

  it("fails (with actual value) when the computed value differs", () => {
    const fake = (_el: Element, _pseudo: string): CSSStyleDeclaration =>
      ({
        getPropertyValue: (p: string) => (p === "content" ? '"OLD"' : ""),
      }) as unknown as CSSStyleDeclaration;
    const el = document.createElement("div");
    const result = assertPseudoElementStyle(fake, el, "::before", "content", '"NEW"');
    expect(result.pass).toBe(false);
    expect(result.actual).toBe('"OLD"');
    expect(result.expected).toBe('"NEW"');
  });

  it("reads the pseudo-element via the two-argument getComputedStyle form", () => {
    let receivedPseudo: string | null = null;
    const fake = (_el: Element, pseudo: string): CSSStyleDeclaration => {
      receivedPseudo = pseudo;
      return { getPropertyValue: () => "red" } as unknown as CSSStyleDeclaration;
    };
    const el = document.createElement("div");
    assertPseudoElementStyle(fake, el, "::after", "color", "red");
    expect(receivedPseudo).toBe("::after");
  });
});
