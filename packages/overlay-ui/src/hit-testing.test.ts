import { afterEach, describe, expect, it } from "vitest";

import { attachOverlayRoot, elementsFromRect, hitTest, isInsideClosedShadowRoot } from "./index.js";

describe("hit testing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("returns the first non-overlay element from elementsFromPoint", () => {
    const overlay = attachOverlayRoot();
    const target = document.createElement("button");
    document.body.appendChild(target);

    const overlayChild = document.createElement("div");
    overlay.shadowRoot.appendChild(overlayChild);

    const elements = [overlay.host, overlayChild, target];
    document.elementsFromPoint = () => elements as Element[];

    const result = hitTest({ x: 50, y: 50 }, overlay.host);
    expect(result).toBe(target);
    overlay.unmount();
  });

  it("returns null when every element is overlay content", () => {
    const overlay = attachOverlayRoot();
    const overlayChild = document.createElement("div");
    overlay.shadowRoot.appendChild(overlayChild);

    document.elementsFromPoint = () => [overlay.host, overlayChild];

    expect(hitTest({ x: 0, y: 0 }, overlay.host)).toBeNull();
    overlay.unmount();
  });
});

describe("elementsFromRect — rectangle hit-testing (PRD §9.1)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.innerHTML = "";
  });

  it("returns 3 unique elements when the rectangle covers them", () => {
    const overlay = attachOverlayRoot();
    const a = document.createElement("div");
    const b = document.createElement("div");
    const c = document.createElement("div");
    document.body.append(a, b, c);

    document.elementsFromPoint = ((x: number, _y: number) => {
      if (x < 20) return [overlay.host, a];
      if (x < 50) return [b];
      return [c];
    }) as typeof document.elementsFromPoint;

    const result = elementsFromRect({ x: 0, y: 0, width: 100, height: 100 }, overlay.host, {
      sampleStep: 30,
    });
    expect(result).toEqual([a, b, c]);
    overlay.unmount();
  });

  it("excludes overlay elements from the result", () => {
    const overlay = attachOverlayRoot();
    const real = document.createElement("button");
    document.body.appendChild(real);

    const overlayChild = document.createElement("div");
    overlay.shadowRoot.appendChild(overlayChild);

    document.elementsFromPoint = (() => [
      overlay.host,
      overlayChild,
      real,
    ]) as typeof document.elementsFromPoint;

    const result = elementsFromRect({ x: 0, y: 0, width: 50, height: 50 }, overlay.host);
    expect(result).toEqual([real]);
    overlay.unmount();
  });

  it("deduplicates elements seen at multiple sample points", () => {
    const overlay = attachOverlayRoot();
    const target = document.createElement("div");
    document.body.appendChild(target);

    document.elementsFromPoint = (() => [target]) as typeof document.elementsFromPoint;

    const result = elementsFromRect({ x: 0, y: 0, width: 100, height: 100 }, overlay.host, {
      sampleStep: 10,
    });
    expect(result).toEqual([target]);
    overlay.unmount();
  });

  it("returns an empty array for a zero-area rect", () => {
    const overlay = attachOverlayRoot();
    const target = document.createElement("div");
    document.body.appendChild(target);

    document.elementsFromPoint = (() => [target]) as typeof document.elementsFromPoint;

    const result = elementsFromRect({ x: 0, y: 0, width: 0, height: 0 }, overlay.host);
    expect(result).toEqual([]);
    overlay.unmount();
  });

  it("excludes elements inside a closed shadow root", () => {
    const overlay = attachOverlayRoot();

    const host = document.createElement("div");
    document.body.appendChild(host);
    const closedRoot = host.attachShadow({ mode: "closed" });
    const inner = document.createElement("span");
    closedRoot.appendChild(inner);

    expect(isInsideClosedShadowRoot(inner)).toBe(true);

    const lightElement = document.createElement("button");
    document.body.appendChild(lightElement);

    document.elementsFromPoint = (() => [lightElement, inner]) as typeof document.elementsFromPoint;

    const result = elementsFromRect({ x: 0, y: 0, width: 100, height: 100 }, overlay.host);
    expect(result).toEqual([lightElement]);
    overlay.unmount();
  });

  it("does not recurse into cross-origin iframe contents (architectural exclusion)", () => {
    const overlay = attachOverlayRoot();
    const topFrameElement = document.createElement("div");
    document.body.appendChild(topFrameElement);

    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    document.elementsFromPoint = (() => [
      topFrameElement,
      iframe,
    ]) as typeof document.elementsFromPoint;

    const result = elementsFromRect({ x: 0, y: 0, width: 200, height: 200 }, overlay.host);

    // The <iframe> host element lives in the top document (selectable); its
    // cross-origin contents are architecturally unreachable (no recursion).
    expect(result).toContain(topFrameElement);
    expect(result).toContain(iframe);
    expect(result.every((el) => el.ownerDocument === document)).toBe(true);
    overlay.unmount();
  });

  it("isInsideClosedShadowRoot returns false for light-DOM elements", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(isInsideClosedShadowRoot(el)).toBe(false);
  });

  it("isInsideClosedShadowRoot returns false for open shadow root elements", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const openRoot = host.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    openRoot.appendChild(inner);
    expect(isInsideClosedShadowRoot(inner)).toBe(false);
  });
});
