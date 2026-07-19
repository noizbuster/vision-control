/**
 * Target resolver: reacquire the target element after HMR/reload.
 *
 * After a Vite HMR update the DOM is rebuilt — the old runtime id is stale and
 * the element may have moved or been replaced. The resolver re-finds the
 * element using a priority cascade (PRD section 18.3):
 *
 *   1. Source ID lookup (durable identity hint): find elements carrying the
 *      `data-vc-source` attribute matching the source id, then disambiguate
 *      repeated instances by fingerprint. Markers do not prove source origin.
 *   2. Role/name match (medium): find elements whose ARIA role and accessible
 *      name match the candidate.
 *   3. Stable selector (medium): query the DOM with the candidate's selector.
 *   4. Fingerprint match (low): scan all elements whose ancestry+attributes
 *      hash to the candidate fingerprint.
 *
 * Returns null when no strategy succeeds. This null is a hard signal to the
 * verification runner: the source patch target is gone.
 */

import type { IdentityConfidence } from "@vision-control/element-identity";

import type { VerificationDomAdapter } from "./dom-adapter.js";
import { resolveDurableElement } from "./durable-target-resolver.js";
import type { ResolvedTarget, SourceCandidate } from "./types.js";

const SOURCE_ATTR = "data-vc-source";

/** Options for {@link resolveTarget}. */
export interface ResolveTargetOptions {
  readonly dom: VerificationDomAdapter;
  /** Identity hints beyond the source id (used by fallback strategies). */
  readonly hints?: SourceCandidate;
  /**
   * Index of the repeated instance to resolve when multiple elements share a
   * source id (e.g. the 2nd of 5 list items). Defaults to 0 (first).
   */
  readonly instanceIndex?: number;
}

/**
 * Resolve a target element after HMR/reload.
 *
 * @param sourceId Opaque source id from the original selection. May be
 *   undefined for elements without a source marker (then only fallback
 *   strategies apply).
 * @param options DOM adapter, identity hints, instance index.
 * @returns The resolved target with confidence, or null when not found.
 */
export async function resolveTarget(
  sourceId: string | undefined,
  options: ResolveTargetOptions,
): Promise<ResolvedTarget | null> {
  const { dom, hints } = options;
  const candidate: SourceCandidate = {
    ...(hints ?? {}),
    ...(sourceId !== undefined ? { sourceId } : {}),
  };

  if (candidate.occurrence !== undefined) {
    if (candidate.selector === undefined || candidate.fingerprint === undefined) return null;
    const durable = resolveDurableElement(dom, {
      selector: candidate.selector,
      occurrence: candidate.occurrence,
      fingerprint: candidate.fingerprint,
      ...(candidate.sourceId !== undefined ? { sourceId: candidate.sourceId } : {}),
    });
    if (durable.kind === "failed") return null;
    return toTarget(durable.element, dom, candidate, "medium");
  }

  // Strategy 1: source ID lookup.
  const bySource = resolveBySourceId(dom, candidate, options);
  if (bySource !== null) return bySource;

  // Strategy 2: role/name match.
  const byRoleName = resolveByRoleName(dom, candidate);
  if (byRoleName !== null) return byRoleName;

  // Strategy 3: stable selector.
  const bySelector = resolveBySelector(dom, candidate);
  if (bySelector !== null) return bySelector;

  // Strategy 4: fingerprint match.
  return resolveByFingerprint(dom, candidate);
}

/** Strategy 1: find by `data-vc-source` without treating the marker as origin proof. */
function resolveBySourceId(
  dom: VerificationDomAdapter,
  candidate: SourceCandidate,
  options: ResolveTargetOptions,
): ResolvedTarget | null {
  if (candidate.sourceId === undefined) return null;

  const selector = `[${SOURCE_ATTR}="${candidate.sourceId}"]`;
  const matches = dom.querySelectorAll(selector);
  if (matches.length === 0) return null;

  const instanceIndex = options.instanceIndex ?? 0;

  // If we have a fingerprint, prefer the instance whose fingerprint matches.
  if (candidate.fingerprint !== undefined) {
    const fingerprinted = matches.find(
      (el) => dom.computeFingerprint(el) === candidate.fingerprint,
    );
    if (fingerprinted !== undefined) {
      return toTarget(fingerprinted, dom, candidate, "medium");
    }
    // Fingerprint mismatch on all instances — stale DOM. Do not fall through to
    // blind instanceIndex; signal "not found" so the runner reports failure.
    return null;
  }

  // No fingerprint: pick by instance index among repeated instances.
  const chosen = matches[instanceIndex] ?? matches[0];
  if (chosen === undefined) return null;
  return toTarget(chosen, dom, candidate, "medium");
}

/** Strategy 2: find by ARIA role + accessible name. */
function resolveByRoleName(
  dom: VerificationDomAdapter,
  candidate: SourceCandidate,
): ResolvedTarget | null {
  if (candidate.role === undefined || candidate.name === undefined) return null;
  const tagSelector = candidate.tagName ?? "";
  const base =
    tagSelector.length > 0
      ? `${tagSelector}[role="${candidate.role}"]`
      : `[role="${candidate.role}"]`;
  const matches = dom.querySelectorAll(base);
  for (const el of matches) {
    const ariaLabel = dom.getAttribute(el, "aria-label");
    const name = ariaLabel ?? dom.getText(el).trim();
    if (name === candidate.name) {
      return toTarget(el, dom, candidate, "medium");
    }
  }
  return null;
}

/** Strategy 3: query by the candidate's stable selector. */
function resolveBySelector(
  dom: VerificationDomAdapter,
  candidate: SourceCandidate,
): ResolvedTarget | null {
  if (candidate.selector === undefined) return null;
  const el = dom.querySelector(candidate.selector);
  if (el === null) return null;
  return toTarget(el, dom, candidate, "medium");
}

/** Strategy 4: scan all elements for a fingerprint match (last resort). */
function resolveByFingerprint(
  dom: VerificationDomAdapter,
  candidate: SourceCandidate,
): ResolvedTarget | null {
  if (candidate.fingerprint === undefined) return null;
  const tag = candidate.tagName ?? "";
  const pool = tag.length > 0 ? dom.querySelectorAll(tag) : dom.querySelectorAll("*");
  for (const el of pool) {
    if (dom.computeFingerprint(el) === candidate.fingerprint) {
      return toTarget(el, dom, candidate, "low");
    }
  }
  return null;
}

/** Build a ResolvedTarget from a resolved element, stamping identity fields. */
function toTarget(
  element: Element,
  dom: VerificationDomAdapter,
  candidate: SourceCandidate,
  confidence: IdentityConfidence,
): ResolvedTarget {
  const runtimeId =
    dom.getAttribute(element, "data-vc-runtime-id") ??
    dom.getAttribute(element, "data-vc-preview-id") ??
    cryptoRandomId();
  return {
    element,
    dom,
    runtimeId,
    ...(candidate.sourceId !== undefined ? { sourceId: candidate.sourceId } : {}),
    ...(candidate.selector !== undefined ? { selector: candidate.selector } : {}),
    confidence,
  };
}

/** Generate a random id when the element has no runtime/preview attribute. */
function cryptoRandomId(): string {
  return `vc-${Math.random().toString(36).slice(2, 10)}`;
}
