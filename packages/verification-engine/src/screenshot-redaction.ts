/**
 * Screenshot redaction (VC-V1V2-15 / ADR-011).
 *
 * Screenshots are a privacy surface: a captured image can contain entered
 * text, credential inputs, hidden auth tokens, or unrelated private DOM that
 * the deny-by-default text redaction layer cannot reach. This module is the
 * image-surface equivalent of `redactContext`: it discovers regions that must
 * be masked BEFORE capture, and re-checks AFTER capture so an overlay or a
 * late-rendered value cannot leak through.
 *
 * Pure + isomorphic. No DOM access: the caller supplies `DomRegionCandidate`
 * descriptors (a browser adapter scans the page and projects each element into
 * a candidate). This keeps the classification logic deterministic and testable
 * without a live page.
 */

import { type Rect, rectIntersects } from "@vision-control/geometry";

/** Why a region was flagged for masking. */
export type RedactionReason = "data-private" | "credential-field" | "hidden-token";

/**
 * One element the caller observed in the capture subtree, projected to a
 * JSON-safe descriptor. The browser adapter fills this in; the pure logic
 * classifies it.
 */
export interface DomRegionCandidate {
  readonly tagName: string;
  readonly bounds: Rect;
  /** `<input type>` value (lowercased by the caller is fine). */
  readonly type?: string;
  /** `<input name>` / form-control name. */
  readonly name?: string;
  /** `<input autocomplete>` token list. */
  readonly autocomplete?: string;
  /** Stable attribute snapshot (e.g. `data-private`). */
  readonly attributes: ReadonlyMap<string, string>;
}

/** A region scheduled for masking, with the reason it was flagged. */
export interface RedactableRegion {
  readonly id: string;
  readonly bounds: Rect;
  readonly reason: RedactionReason;
}

/** Result of the post-capture re-check. */
export interface RecheckResult {
  readonly verdict: "pass" | "fail";
  /** Sensitive regions present post-capture that no pre-mask covered. */
  readonly leaks: readonly RedactableRegion[];
  readonly notes: readonly string[];
}

/** Final redaction report persisted alongside the artifact (metadata only). */
export interface RedactionReport {
  readonly maskedRegions: readonly RedactableRegion[];
  readonly totalMasked: number;
  readonly postCaptureRecheck: "pass" | "fail";
  readonly recheckLeaks: readonly RedactableRegion[];
  readonly recheckNotes: readonly string[];
}

// Classification patterns. Conservative: a name/autocomplete token must look
// like a credential or token field; ordinary fields are left alone so the
// capture is not blanked out by false positives.
const CREDENTIAL_NAME_RE = /password|passwd|passphrase|secret|credential/i;
const CREDENTIAL_AUTOCOMPLETE_RE = /cc-|current-password|new-password|one-time-code/i;
const HIDDEN_TOKEN_NAME_RE = /token|csrf|authenticity|auth|nonce|secret/i;

/**
 * Classify a single candidate. Returns the masking reason when the candidate is
 * sensitive, otherwise `undefined` (leave visible).
 */
export function classifyRegion(candidate: DomRegionCandidate): RedactionReason | undefined {
  if (candidate.attributes.has("data-private")) return "data-private";
  if (candidate.attributes.has("data-private-token")) return "hidden-token";

  if (candidate.tagName.toLowerCase() !== "input") return undefined;

  const type = (candidate.type ?? "text").toLowerCase();
  if (type === "password") return "credential-field";

  if (
    type === "hidden" &&
    candidate.name !== undefined &&
    HIDDEN_TOKEN_NAME_RE.test(candidate.name)
  ) {
    return "hidden-token";
  }
  if (candidate.name !== undefined && CREDENTIAL_NAME_RE.test(candidate.name)) {
    return "credential-field";
  }
  if (
    candidate.autocomplete !== undefined &&
    CREDENTIAL_AUTOCOMPLETE_RE.test(candidate.autocomplete)
  ) {
    return "credential-field";
  }
  return undefined;
}

/**
 * Scan a list of candidates and return the redactable regions, each with a
 * stable id (`redact-<n>`, 1-based in iteration order).
 */
export function discoverRedactableRegions(
  candidates: readonly DomRegionCandidate[],
): readonly RedactableRegion[] {
  const regions: RedactableRegion[] = [];
  let counter = 0;
  for (const candidate of candidates) {
    const reason = classifyRegion(candidate);
    if (reason !== undefined) {
      counter += 1;
      regions.push({ id: `redact-${counter}`, bounds: candidate.bounds, reason });
    }
  }
  return regions;
}

/**
 * Post-capture re-check. A sensitive region observed AFTER capture whose bounds
 * are not covered by any pre-masked region is a leak: its value may have been
 * rendered into the image before the mask was painted. "Covered" = the region
 * intersects at least one pre-masked rectangle (the mask overlapped it).
 */
export function recheckCapture(
  preMaskedRegions: readonly RedactableRegion[],
  postCaptureCandidates: readonly DomRegionCandidate[],
): RecheckResult {
  const postRegions = discoverRedactableRegions(postCaptureCandidates);
  const leaks: RedactableRegion[] = [];
  const notes: string[] = [];
  for (const region of postRegions) {
    const covered = preMaskedRegions.some((pre) => rectIntersects(pre.bounds, region.bounds));
    if (!covered) {
      leaks.push(region);
      notes.push(`unmasked ${region.reason} region at capture re-check`);
    }
  }
  return { verdict: leaks.length === 0 ? "pass" : "fail", leaks, notes };
}

/** Assemble the persisted redaction report from the masked set + re-check. */
export function buildRedactionReport(
  maskedRegions: readonly RedactableRegion[],
  recheck: RecheckResult,
): RedactionReport {
  return {
    maskedRegions,
    totalMasked: maskedRegions.length,
    postCaptureRecheck: recheck.verdict,
    recheckLeaks: recheck.leaks,
    recheckNotes: recheck.notes,
  };
}
