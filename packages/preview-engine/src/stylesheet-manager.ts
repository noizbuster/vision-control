/**
 * Dynamic preview stylesheet manager.
 *
 * Owns a single `<style>` element injected into the inspected page's `<head>`
 * (NOT the overlay's shadow root — the preview must affect the actual page
 * DOM). Maintains a `selector -> declarations` map and rebuilds the
 * `textContent` on each change. This is simpler and more robust than tracking
 * CSSStyleSheet rule indices.
 */

import type { RollbackFn } from "./adapters/preview-adapter.js";
import { buildPreviewSelector, PREVIEW_STYLE_ATTR, type PreviewDomAdapter } from "./dom-adapter.js";

export interface StylesheetManager {
  /** Write or update a CSS rule for the given selector. */
  readonly applyRule: (selector: string, declarations: string) => void;
  /** Remove the CSS rule for the given selector. */
  readonly removeRule: (selector: string) => void;
  /** Whether a rule exists for the given selector. */
  readonly hasRule: (selector: string) => boolean;
  /** Number of active rules. */
  readonly ruleCount: () => number;
  /** Remove the entire `<style>` element and all rules. */
  readonly clear: () => void;
}

export function createStylesheetManager(dom: PreviewDomAdapter): StylesheetManager {
  const rules = new Map<string, string>();
  let styleElement: HTMLStyleElement | null = null;

  const ensureStyleElement = (): HTMLStyleElement => {
    if (styleElement !== null) return styleElement;
    styleElement = dom.createStyleElement();
    styleElement.setAttribute(PREVIEW_STYLE_ATTR, "");
    dom.appendToHead(styleElement);
    return styleElement;
  };

  const flush = (): void => {
    const el = ensureStyleElement();
    const css = Array.from(rules.entries())
      .map(([sel, decls]) => `${sel} { ${decls} }`)
      .join("\n");
    el.textContent = css;
  };

  const applyRule = (selector: string, declarations: string): void => {
    rules.set(selector, declarations);
    flush();
  };

  const removeRule = (selector: string): void => {
    if (!rules.delete(selector)) return;
    flush();
  };

  const hasRule = (selector: string): boolean => rules.has(selector);

  const ruleCount = (): number => rules.size;

  const clear = (): void => {
    rules.clear();
    if (styleElement !== null) {
      styleElement.remove();
      styleElement = null;
    }
  };

  return { applyRule, removeRule, hasRule, ruleCount, clear };
}

/**
 * Helper to apply a style rule targeting a runtime-id'd element. Used by both
 * style-edit and resize-element operations. Returns a rollback that removes
 * the rule.
 */
export function applyCssRule(
  stylesheet: StylesheetManager,
  runtimeId: string,
  declarations: string,
): RollbackFn {
  const selector = buildPreviewSelector(runtimeId);
  stylesheet.applyRule(selector, declarations);
  return (): void => {
    stylesheet.removeRule(selector);
  };
}
