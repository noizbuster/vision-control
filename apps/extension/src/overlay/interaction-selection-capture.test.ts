import { generateStableSelector } from "@vision-control/element-identity";
import { createBrowserDomAdapter } from "@vision-control/inspector-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { captureSelectionContext } from "./interaction-selection-capture.js";

const setRect = (element: Element, width = 100, height = 50): void => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, height));
};

describe("interaction selection capture", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
  });

  it("returns a diagnostic for an element in a disconnected subtree", () => {
    const parent = document.createElement("div");
    const target = document.createElement("div");
    parent.appendChild(target);

    expect(captureSelectionContext(target)).toEqual({
      ok: false,
      diagnostic: "disconnected-element",
    });
  });

  it("captures an element whose id needs CSS escaping with a valid occurrence", () => {
    const target = document.createElement("div");
    target.id = "card:one";
    document.body.appendChild(target);
    setRect(target);
    const adapter = createBrowserDomAdapter();
    const targetSelector = generateStableSelector({ descriptor: adapter.getDescriptor(target) });
    expect(Array.from(document.querySelectorAll(targetSelector))).toContain(target);

    const result = captureSelectionContext(target);

    if (!result.ok) throw new Error(result.diagnostic);
    expect(result.context.resize.target.selectorOccurrence).toBe(0);
  });

  it("captures literal content-box geometry and repeated sibling identity", () => {
    const ancestor = document.createElement("main");
    ancestor.style.transform = "translateX(3px)";
    ancestor.style.setProperty("zoom", "1.25");
    const parent = document.createElement("section");
    parent.style.cssText =
      "display:flex;flex-direction:row-reverse;flex-wrap:nowrap;writing-mode:vertical-rl;box-sizing:border-box;padding:4px 8px 12px 16px;border:2px solid black";
    const createChild = (): HTMLDivElement => {
      const child = document.createElement("div");
      child.className = "repeated-card";
      child.setAttribute("data-vc-source", "src-repeated-card");
      child.style.cssText =
        "box-sizing:content-box;padding:3px 5px 7px 11px;border-style:solid;border-width:2px 4px 6px 8px;direction:rtl;order:7;position:relative;flex:0 1 120px;min-width:40px;max-width:240px;margin:1px 2px 3px 4px";
      return child;
    };
    const first = createChild();
    const target = createChild();
    const third = createChild();
    parent.append(first, document.createTextNode("anonymous"), target, third);
    ancestor.appendChild(parent);
    document.body.appendChild(ancestor);
    setRect(parent, 420, 120);
    for (const child of [first, target, third]) setRect(child, 120, 80);

    const result = captureSelectionContext(target);

    if (!result.ok) throw new Error(result.diagnostic);
    const context = result.context.resize;
    expect(context.target.ref.sourceId).toBe("src-repeated-card");
    expect(context.target.ref.selector).toBe('[data-vc-source="src-repeated-card"]');
    expect(context.target.selectorOccurrence).toBe(1);
    expect(context.directChildren.map((child) => child.selectorOccurrence)).toEqual([0, 1, 2]);
    expect(context.directChildren.map((child) => child.ref.sourceId)).toEqual([
      "src-repeated-card",
      "src-repeated-card",
      "src-repeated-card",
    ]);
    expect(context.target.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(context.target.fingerprint).toBe(context.directChildren[0]?.fingerprint);
    expect(context.target.fingerprint).toBe(context.directChildren[2]?.fingerprint);
    expect(context.target.style).toMatchObject({
      boxSizing: "content-box",
      paddingTop: "3px",
      paddingRight: "5px",
      paddingBottom: "7px",
      paddingLeft: "11px",
      borderTopWidth: "2px",
      borderRightWidth: "4px",
      borderBottomWidth: "6px",
      borderLeftWidth: "8px",
      direction: "rtl",
      order: "7",
      position: "relative",
      flexBasis: "120px",
      flexGrow: "0",
      flexShrink: "1",
      minWidth: "40px",
      maxWidth: "240px",
      marginLeft: "4px",
    });
    expect(context.parent.rect).toMatchObject({ width: 420, height: 120 });
    expect(context.parent.style).toMatchObject({
      display: "flex",
      flexDirection: "row-reverse",
      flexWrap: "nowrap",
      writingMode: "vertical-rl",
      boxSizing: "border-box",
      paddingLeft: "16px",
      borderLeftWidth: "2px",
    });
    expect(context.directChildren.map((child) => child.rect.width)).toEqual([120, 120, 120]);
    expect(context.directChildNodes).toHaveLength(4);
    expect(context.hasDirectTextNode).toBe(true);
    expect(context.ancestorChain[1]).toMatchObject({
      element: ancestor,
      transform: "translateX(3px)",
      zoom: "1.25",
    });
  });

  it("uses a literal structural selector when the preferred selector misses", () => {
    const target = document.createElement("div");
    target.className = "preferred";
    document.body.appendChild(target);
    setRect(target);
    const querySelectorAll = document.querySelectorAll.bind(document);
    vi.spyOn(document, "querySelectorAll").mockImplementation((selector) =>
      selector === "div.preferred"
        ? document.createDocumentFragment().querySelectorAll("div")
        : querySelectorAll(selector),
    );

    const result = captureSelectionContext(target);

    if (!result.ok) throw new Error(result.diagnostic);
    expect(result.context.resize.target.ref.selector).toBe("body > div:nth-child(1)");
    expect(result.context.resize.target.selectorOccurrence).toBe(0);
  });

  it("returns invalid-selector-occurrence when preferred and structural selectors miss", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    setRect(target);
    const empty = document.createDocumentFragment().querySelectorAll("div");
    vi.spyOn(document, "querySelectorAll").mockReturnValue(empty);

    expect(captureSelectionContext(target)).toEqual({
      ok: false,
      diagnostic: "invalid-selector-occurrence",
    });
  });

  it("crosses an open shadow root when capturing transform and zoom ancestry", () => {
    const outer = document.createElement("main");
    outer.style.transform = "translateX(3px)";
    outer.style.setProperty("zoom", "1.25");
    const host = document.createElement("section");
    host.style.transform = "scale(0.5)";
    host.style.setProperty("zoom", "2");
    outer.appendChild(host);
    document.body.appendChild(outer);
    const shadow = host.attachShadow({ mode: "open" });
    const parent = document.createElement("div");
    const target = document.createElement("div");
    parent.appendChild(target);
    shadow.appendChild(parent);
    setRect(parent);
    setRect(target);

    const result = captureSelectionContext(target);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.resize.ancestorChain).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ element: host, transform: "scale(0.5)", zoom: "2" }),
          expect.objectContaining({
            element: outer,
            transform: "translateX(3px)",
            zoom: "1.25",
          }),
        ]),
      );
    }
  });
});
