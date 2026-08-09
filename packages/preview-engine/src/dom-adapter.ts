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

/** Releases a temporary runtime-id binding. Safe to call more than once. */
export type UnbindFn = () => void;

/**
 * Contract for all DOM operations the preview engine needs. The browser
 * factory ({@link createBrowserPreviewDomAdapter}) is the canonical impl;
 * tests can provide a jsdom-backed or fake adapter.
 */
export interface PreviewDomAdapter {
  /** Resolve a runtime id to its DOM element. Returns null if unregistered. */
  readonly resolveElement: (runtimeId: string) => Element | null;
  /** Register a persistent runtime id and tag it for CSS preview selectors. */
  readonly registerElement: (runtimeId: string, element: Element) => void;
  /** Bind a runtime id without mutating DOM attributes. */
  readonly bindElement: (runtimeId: string, element: Element) => UnbindFn;
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
type BindingEntry = {
  readonly element: Element;
  readonly token: symbol;
  active: boolean;
  readonly previous: BindingEntry | null;
};

export function createBrowserPreviewDomAdapter(): PreviewDomAdapter {
  const elements = new Map<string, BindingEntry>();

  const resolveElement = (runtimeId: string): Element | null =>
    elements.get(runtimeId)?.element ?? document.querySelector(buildPreviewSelector(runtimeId));

  const registerElement = (runtimeId: string, element: Element): void => {
    elements.set(runtimeId, {
      element,
      token: Symbol(runtimeId),
      active: true,
      previous: null,
    });
    element.setAttribute(PREVIEW_ID_ATTR, runtimeId);
  };

  const bindElement = (runtimeId: string, element: Element): UnbindFn => {
    const entry: BindingEntry = {
      element,
      token: Symbol(runtimeId),
      active: true,
      previous: elements.get(runtimeId) ?? null,
    };
    elements.set(runtimeId, entry);

    return (): void => {
      if (!entry.active) return;
      entry.active = false;
      if (elements.get(runtimeId)?.token !== entry.token) return;

      let previous = entry.previous;
      while (previous !== null && !previous.active) previous = previous.previous;
      if (previous === null) elements.delete(runtimeId);
      else elements.set(runtimeId, previous);
    };
  };

  return {
    resolveElement,
    registerElement,
    bindElement,
    createStyleElement: () => document.createElement("style"),
    appendToHead: (node) => document.head.appendChild(node),
    getComputedStyle: (element) => window.getComputedStyle(element),
    getRect: (element) => {
      const domRect = element.getBoundingClientRect();
      return {
        x: domRect.left,
        y: domRect.top,
        width: domRect.width,
        height: domRect.height,
      };
    },
    createMutationObserver: (callback) => new MutationObserver(callback),
  };
}
