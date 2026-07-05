/**
 * DOM access boundary for the preview engine.
 *
 * Following the inspector-core dom-adapter pattern: this is the ONLY module
 * that references document-level APIs. All preview logic consumes this
 * interface, keeping the package isomorphic (pure logic) while the browser
 * factory wires real DOM access. Tests inject a jsdom-backed adapter.
 */

/** Attribute used to target previewed elements via CSS selectors. */
export const PREVIEW_ID_ATTR = "data-vc-preview-id";

/** Stylesheet marker so clearAll can find and remove the preview <style>. */
export const PREVIEW_STYLE_ATTR = "data-vc-preview-stylesheet";

/** Build a CSS attribute selector targeting a previewed element. */
export function buildPreviewSelector(runtimeId: string): string {
  return `[${PREVIEW_ID_ATTR}="${runtimeId}"]`;
}

/** A screen-space rectangle used for ghost positioning. */
export interface PreviewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Contract for all DOM operations the preview engine needs. The browser
 * factory ({@link createBrowserPreviewDomAdapter}) is the canonical impl;
 * tests can provide a jsdom-backed or fake adapter.
 */
export interface PreviewDomAdapter {
  /** Resolve a runtime id to its DOM element. Returns null if unregistered. */
  readonly resolveElement: (runtimeId: string) => Element | null;
  /** Register a runtime id with its DOM element (also tags it for CSS selectors). */
  readonly registerElement: (runtimeId: string, element: Element) => void;
  /** Create a <style> element for preview CSS rules. */
  readonly createStyleElement: () => HTMLStyleElement;
  /** Append a node to the document <head>. */
  readonly appendToHead: (node: Node) => void;
  /** Read the computed style of an element (for specificity conflict checks). */
  readonly getComputedStyle: (element: Element) => CSSStyleDeclaration;
  /** Read an element's bounding rect in viewport coordinates. */
  readonly getRect: (element: Element) => PreviewRect;
  /** Create a MutationObserver wrapping the given callback. */
  readonly createMutationObserver: (callback: MutationCallback) => MutationObserver;
}

/**
 * Build a DOM adapter backed by a real `document`. The adapter maintains an
 * internal `Map<runtimeId, Element>` that the caller populates via
 * `registerElement` (typically from the content script's runtime assignments).
 */
export function createBrowserPreviewDomAdapter(): PreviewDomAdapter {
  const elements = new Map<string, Element>();

  const resolveElement = (runtimeId: string): Element | null => {
    return elements.get(runtimeId) ?? document.querySelector(buildPreviewSelector(runtimeId));
  };

  const registerElement = (runtimeId: string, element: Element): void => {
    elements.set(runtimeId, element);
    element.setAttribute(PREVIEW_ID_ATTR, runtimeId);
  };

  const createStyleElement = (): HTMLStyleElement => {
    return document.createElement("style");
  };

  const appendToHead = (node: Node): void => {
    document.head.appendChild(node);
  };

  const getComputedStyle = (element: Element): CSSStyleDeclaration => {
    return window.getComputedStyle(element);
  };

  const getRect = (element: Element): PreviewRect => {
    const domRect = element.getBoundingClientRect();
    return {
      x: domRect.left,
      y: domRect.top,
      width: domRect.width,
      height: domRect.height,
    };
  };

  const createMutationObserver = (callback: MutationCallback): MutationObserver => {
    return new MutationObserver(callback);
  };

  return {
    resolveElement,
    registerElement,
    createStyleElement,
    appendToHead,
    getComputedStyle,
    getRect,
    createMutationObserver,
  };
}
