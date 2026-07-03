/**
 * Group-level verification assertions for multi-element operations.
 *
 * Unlike the single-target assertions in this directory (which take a
 * {@link ResolvedTarget} and read one element), these builders resolve a GROUP
 * of element refs via the DOM adapter and assert group-level properties:
 *
 *   - reading-order (align-elements / distribute-elements): after the operation
 *     lands as source, the DOM order and visual order of the targets must agree.
 *     A divergence means the alignment introduced a CSS-`order`-style visual
 *     reorder that breaks the reading sequence for assistive-tech users (PRD
 *     section 2003). Delegates to {@link assertReadingOrderPreserved}.
 *
 *   - composition (multi-select-group): every recorded target must resolve in
 *     the DOM after HMR. A count mismatch means a recorded target was dropped.
 *
 * Both assertions have REAL failure modes: a target that doesn't resolve, or a
 * DOM-vs-visual order desync. Neither can pass unconditionally.
 */

import type { ElementRef } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";

import { assertReadingOrderPreserved } from "../alignment-accessibility.js";
import type { VerificationDomAdapter } from "../dom-adapter.js";
import type { AssertionEntry, AssertionResult, ResolvedTarget } from "../types.js";

/** Subpixel tolerance for grouping elements into the same visual row (px). */
const ROW_TOLERANCE = 1;

/** A group target resolved to its order data (identity + DOM index + rect). */
interface ResolvedGroupTarget {
  readonly identity: string;
  readonly domIndex: number;
  readonly rect: Rect;
}

/**
 * Resolve a group of element refs via the DOM adapter. Resolution priority:
 * source-marker id (survives HMR, injected in source) then explicit CSS
 * selector, then runtime-id attribute (assigned at runtime). Returns null for
 * any ref that cannot be resolved.
 */
function resolveGroupTargets(
  dom: VerificationDomAdapter,
  targets: readonly ElementRef[],
): Array<ResolvedGroupTarget | null> {
  return targets.map((ref) => {
    const element = resolveRef(dom, ref);
    if (element === null) return null;
    return {
      identity: ref.runtimeId,
      domIndex: dom.getSiblingIndex(element),
      rect: dom.getRect(element),
    };
  });
}

function resolveRef(dom: VerificationDomAdapter, ref: ElementRef): Element | null {
  if (ref.sourceId !== undefined && ref.sourceId.length > 0) {
    const bySource = dom.querySelector(`[data-vc-source="${ref.sourceId}"]`);
    if (bySource !== null) return bySource;
  }
  if (ref.selector !== undefined && ref.selector.length > 0) {
    const bySelector = dom.querySelector(ref.selector);
    if (bySelector !== null) return bySelector;
  }
  return dom.querySelector(`[data-vc-runtime-id="${ref.runtimeId}"]`);
}

/**
 * Build a reading-order assertion for an align/distribute operation. Resolves
 * each target via the DOM adapter, builds parallel dom-order and visual-order
 * identity arrays, and delegates to {@link assertReadingOrderPreserved}.
 *
 * Failure modes: (1) a target doesn't resolve in the DOM; (2) visual order
 * diverges from DOM order (CSS-`order`-style desync).
 */
export function buildReadingOrderAssertion(
  kind: "align-elements" | "distribute-elements",
  targets: readonly ElementRef[],
): AssertionEntry {
  return {
    name: `${kind}:reading-order`,
    run: (resolved) => {
      const resolvedTargets = resolveGroupTargets(resolved.dom, targets);
      const unresolvedIndex = resolvedTargets.indexOf(null);
      if (unresolvedIndex !== -1) {
        const ref = targets[unresolvedIndex];
        return {
          name: "reading-order-preserved",
          passed: false,
          expected: `${targets.length} resolvable target(s)`,
          actual: `target at index ${unresolvedIndex} (${ref?.runtimeId ?? "?"}) not found in DOM`,
          message: `Reading-order check could not resolve every ${kind} target in the DOM after HMR.`,
        };
      }
      const items = resolvedTargets.filter((t): t is ResolvedGroupTarget => t !== null);
      const domOrder = sortByDomIndex(items).map((t) => t.identity);
      const visualOrder = sortByVisualPosition(items).map((t) => t.identity);
      return assertReadingOrderPreserved(domOrder, visualOrder);
    },
  };
}

/**
 * Build a composition assertion for a multi-select-group operation. Every
 * recorded target must resolve in the DOM after HMR; a count mismatch means a
 * recorded target was dropped.
 *
 * Failure mode: fewer targets resolve than were recorded.
 */
export function buildGroupCompositionAssertion(targets: readonly ElementRef[]): AssertionEntry {
  return {
    name: "multi-select-group:composition",
    run: (resolved) => runGroupComposition(resolved, targets),
  };
}

function runGroupComposition(
  resolved: ResolvedTarget,
  targets: readonly ElementRef[],
): AssertionResult {
  const resolvedTargets = resolveGroupTargets(resolved.dom, targets);
  const resolvedCount = resolvedTargets.filter((t) => t !== null).length;
  const recordedCount = targets.length;
  const passed = resolvedCount === recordedCount;
  return {
    name: "multi-select-group:composition",
    passed,
    expected: `${recordedCount} target(s) recorded`,
    actual: `${resolvedCount} target(s) resolved in DOM`,
    message: passed
      ? `Multi-select group verified: all ${recordedCount} recorded target(s) resolve in the DOM.`
      : `Multi-select group mismatch: ${recordedCount} target(s) recorded but only ${resolvedCount} resolve in the DOM after HMR.`,
  };
}

function sortByDomIndex(items: readonly ResolvedGroupTarget[]): ResolvedGroupTarget[] {
  return [...items].sort((a, b) => a.domIndex - b.domIndex);
}

/**
 * Row-major visual position comparator: top-to-bottom, left-to-right within a
 * row. Elements whose vertical positions agree within {@link ROW_TOLERANCE} are
 * treated as the same row and sorted by horizontal position. Ties break on DOM
 * index for determinism.
 */
function sortByVisualPosition(items: readonly ResolvedGroupTarget[]): ResolvedGroupTarget[] {
  return [...items].sort(compareVisualPosition);
}

function compareVisualPosition(a: ResolvedGroupTarget, b: ResolvedGroupTarget): number {
  const dy = a.rect.y - b.rect.y;
  if (Math.abs(dy) > ROW_TOLERANCE) return dy;
  const dx = a.rect.x - b.rect.x;
  return dx !== 0 ? dx : a.domIndex - b.domIndex;
}
