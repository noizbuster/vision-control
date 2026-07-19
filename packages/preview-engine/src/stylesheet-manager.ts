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
  readonly applyRule: (selector: string, declarations: string) => RollbackFn;
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
  interface RuleEntry {
    readonly declarations: string;
    readonly previous: RuleEntry | undefined;
  }

  const rules = new Map<string, RuleEntry>();
  const cancelled = new WeakSet<RuleEntry>();
  let styleElement: HTMLStyleElement | null = null;

  const ensureStyleElement = (): HTMLStyleElement => {
    if (styleElement !== null) return styleElement;
    styleElement = dom.createStyleElement();
    styleElement.setAttribute(PREVIEW_STYLE_ATTR, "");
    dom.appendToHead(styleElement);
    return styleElement;
  };

  const flush = (entries: ReadonlyMap<string, RuleEntry> = rules): void => {
    const el = ensureStyleElement();
    const css = Array.from(entries.entries())
      .map(([selector, entry]) => `${selector} { ${entry.declarations} }`)
      .join("\n");
    el.textContent = css;
  };

  const applyRule = (selector: string, declarations: string): RollbackFn => {
    const previous = rules.get(selector);
    const applied: RuleEntry = { declarations, previous };
    const nextRules = new Map(rules);
    nextRules.set(selector, applied);
    flush(nextRules);
    rules.set(selector, applied);
    return (): void => {
      if (cancelled.has(applied)) return;
      cancelled.add(applied);
      if (rules.get(selector) !== applied) return;
      let restored = applied.previous;
      while (restored !== undefined && cancelled.has(restored)) {
        restored = restored.previous;
      }
      if (restored === undefined) {
        removeRule(selector);
        return;
      }
      rules.set(selector, restored);
      flush();
    };
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
  return stylesheet.applyRule(selector, declarations);
}
