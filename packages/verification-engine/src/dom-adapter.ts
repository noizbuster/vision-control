/**
 * DOM access boundary for the verification engine.
 *
 * Following the preview-engine / inspector-core dom-adapter pattern: this is
 * the ONLY module that touches `document`/`window` level APIs. All assertion
 * and resolution logic consumes this interface, keeping the package isomorphic
 * (pure logic) while the browser factory wires real DOM access. Tests inject a
 * jsdom-backed adapter.
 *
 * The verification engine is the FINAL gate in the edit loop: after HMR, it
 * clears the preview layer, reacquires the target element, and asserts that the
 * source patch actually landed in the live DOM (PRD section 12.5, Appendix D.1).
 * A preview that renders correctly does NOT prove the source changed.
 */

import { computeFingerprint } from "@vision-control/element-identity";
import { type Rect, rectFromDomRect } from "@vision-control/geometry";

/** A captured console entry observed during the verification window. */
export interface ConsoleEntry {
  readonly level: "error" | "warn" | "log" | "info";
  readonly message: string;
  readonly timestamp: number;
}

export interface DirectChildSnapshot {
  readonly elements: readonly Element[];
  readonly hasNonWhitespaceText: boolean;
}

/**
 * Contract for all DOM operations the verification engine needs. The browser
 * factory ({@link createBrowserVerificationDomAdapter}) is the canonical impl;
 * tests provide a jsdom-backed or fake adapter.
 */
export interface VerificationDomAdapter {
  /** Query the first element matching `selector`, or null. */
  readonly querySelector: (selector: string) => Element | null;
  /** Query all elements matching `selector`. */
  readonly querySelectorAll: (selector: string) => readonly Element[];
  /** Read the text content of `element`. */
  readonly getText: (element: Element) => string;
  /** Read the class list of `element` as a sorted-stable array. */
  readonly getClasses: (element: Element) => readonly string[];
  /** Read one computed-style property value (resolved, cascaded). */
  readonly getStyle: (element: Element, property: string) => string;
  /** Read the bounding rect in viewport coordinates. */
  readonly getRect: (element: Element) => Rect;
  /** Read the parent element, or null for orphaned / root. */
  readonly getParent: (element: Element) => Element | null;
  /** Flex-pair lens; paired assertions fail closed when a non-browser adapter omits it. */
  readonly getDirectChildren?: (element: Element) => DirectChildSnapshot;
  /** 0-based index of `element` among its element siblings. */
  readonly getSiblingIndex: (element: Element) => number;
  /** Read an attribute value, or null when absent. */
  readonly getAttribute: (element: Element, name: string) => string | null;
  /** True when `element` is still connected to the document. */
  readonly isConnected: (element: Element) => boolean;
  /** True when `element` matches `selector` (element.matches). */
  readonly matchesSelector: (element: Element, selector: string) => boolean;
  /** Compute the DOM-path fingerprint (element-identity) for `element`. */
  readonly computeFingerprint: (element: Element) => string;
  /** Snapshot of console entries captured during the verification window. */
  readonly getConsoleEntries: () => readonly ConsoleEntry[];
}

/** Attribute the source-marker plugin injects on DOM elements. */
const SOURCE_ATTR = "data-vc-source";

/** Attribute the preview engine injects on previewed elements. */
const PREVIEW_ID_ATTR = "data-vc-preview-id";

/** Attribute the source-registry runtime-id assignment injects. */
const RUNTIME_ATTR = "data-vc-runtime-id";

/**
 * Build the ancestry chain (root → parent) as ElementDescriptors for the
 * element-identity fingerprint. Walks `parentElement` up to `document.body` (or
 * the document element), collecting tag names and stable attributes.
 */
function buildAncestry(element: Element): Array<{
  readonly tagName: string;
  readonly id?: string;
  readonly className?: string;
}> {
  const chain: Array<{
    readonly tagName: string;
    readonly id?: string;
    readonly className?: string;
  }> = [];
  let node: Element | null = element.parentElement;
  while (node !== null && node !== document.documentElement.parentElement) {
    chain.unshift({
      tagName: node.tagName.toLowerCase(),
      ...(node.id ? { id: node.id } : {}),
      ...(typeof node.className === "string" && node.className.length > 0
        ? { className: node.className }
        : {}),
    });
    node = node.parentElement;
    if (node === document.documentElement) {
      chain.unshift({ tagName: "html" });
      break;
    }
    if (node === document.body) {
      chain.unshift({ tagName: "body" });
      break;
    }
  }
  return chain;
}

/**
 * Build a DOM adapter backed by a real `document` and `window`. The adapter
 * also installs console capture hooks so {@link getConsoleEntries} returns
 * entries observed since the adapter was created.
 */
export function createBrowserVerificationDomAdapter(options?: {
  readonly captureConsole?: boolean;
}): VerificationDomAdapter {
  const capture = options?.captureConsole ?? true;
  const consoleEntries: ConsoleEntry[] = [];

  if (capture) {
    const wrap =
      (level: ConsoleEntry["level"]) =>
      (original: (...args: unknown[]) => void) =>
      (...args: unknown[]): void => {
        consoleEntries.push({
          level,
          message: args.map(formatConsoleArg).join(" "),
          timestamp: Date.now(),
        });
        original.apply(console, args as never[]);
      };

    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);
    console.error = wrap("error")(originalError);
    console.warn = wrap("warn")(originalWarn);
  }

  return {
    querySelector: (selector: string): Element | null => document.querySelector(selector),

    querySelectorAll: (selector: string): readonly Element[] => {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch {
        return [];
      }
    },

    getText: (element: Element): string => element.textContent ?? "",

    getClasses: (element: Element): readonly string[] => {
      const cls = element.getAttribute("class");
      if (cls === null) return [];
      return cls
        .split(/\s+/)
        .filter((c) => c.length > 0)
        .sort();
    },

    getStyle: (element: Element, property: string): string =>
      window.getComputedStyle(element).getPropertyValue(property),

    getRect: (element: Element): Rect => rectFromDomRect(element.getBoundingClientRect()),

    getParent: (element: Element): Element | null => element.parentElement,

    getDirectChildren: (element: Element): DirectChildSnapshot => ({
      elements: Array.from(element.children),
      hasNonWhitespaceText: Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && (node.textContent?.trim().length ?? 0) > 0,
      ),
    }),

    getSiblingIndex: (element: Element): number => {
      let index = 0;
      let sibling = element.previousElementSibling;
      while (sibling !== null) {
        index += 1;
        sibling = sibling.previousElementSibling;
      }
      return index;
    },

    getAttribute: (element: Element, name: string): string | null => element.getAttribute(name),

    isConnected: (element: Element): boolean => element.isConnected,

    matchesSelector: (element: Element, selector: string): boolean => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    },

    computeFingerprint: (element: Element): string =>
      computeFingerprint({
        tagName: element.tagName.toLowerCase(),
        ...(element.id ? { id: element.id } : {}),
        ...(typeof element.className === "string" && element.className.length > 0
          ? { className: element.className }
          : {}),
        attributes: readStableAttrs(element),
        ancestry: buildAncestry(element),
      }),

    getConsoleEntries: (): readonly ConsoleEntry[] => [...consoleEntries],
  };
}

/** Read the stable-attribute subset the fingerprint depends on. */
function readStableAttrs(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const name of [SOURCE_ATTR, "id", "role", "name", "data-testid"]) {
    const value = element.getAttribute(name);
    if (value !== null) attrs[name] = value;
  }
  return attrs;
}

/** Read-only attribute names the verification adapter uses internally. */
export const VERIFICATION_ATTRS = {
  source: SOURCE_ATTR,
  previewId: PREVIEW_ID_ATTR,
  runtimeId: RUNTIME_ATTR,
} as const;

/** Format a single console argument for the captured entry message. */
function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
