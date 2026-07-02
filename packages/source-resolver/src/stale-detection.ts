import type { SourceEntry } from "@vision-control/source-registry";

/**
 * Stale-registry detection (PRD 18.3).
 *
 * The source-marker plugin stamps each JSX location with a fingerprint (a hash
 * of the element's tag + stable attributes). When the DOM changes after HMR,
 * re-render, or manual edit, the element's current fingerprint diverges from
 * the one stored in the registry entry. This function detects that divergence
 * so the resolver can downgrade confidence instead of silently trusting stale
 * data.
 *
 * Pure comparison — no side effects, no DOM access.
 */
export const isStaleEntry = (registryEntry: SourceEntry, currentFingerprint: string): boolean =>
  registryEntry.fingerprint !== currentFingerprint;
