/**
 * CSS Modules composition tracing (VC-V1V2-12).
 *
 * CSS Modules `composes: a from "./b.module.css"` produces a runtime class that
 * includes multiple hashed names. The bundler manifest records this as a
 * space-separated value: `"button": "_base_1a2b _button_3c4d"`.
 *
 * This module traces the composition chain so the adapter can produce MULTIPLE
 * source candidates for one runtime hashed class — one for the primary
 * declaration and one for each compose target. Each compose target carries an
 * `isComposedTarget: true` flag so the adapter can add an appropriate ownership
 * risk warning.
 */

import type { CssModulesManifest } from "./manifest.js";

/** One traced compose candidate for a runtime hashed class. */
export interface ComposedCandidate {
  /** Workspace-relative module path where this class is declared. */
  readonly modulePath: string;
  /** Local class name in the module source. */
  readonly localName: string;
  /** The hashed name that matched (direct or composed). */
  readonly hashedName: string;
  /** True when this candidate was reached via a composes chain. */
  readonly isComposedTarget: boolean;
}

/**
 * Trace all source candidates for a runtime hashed class, including compose
 * targets.
 *
 * If the hashed class maps to a manifest entry with multiple `composedHashes`,
 * each additional hash is reverse-looked-up in the manifest to find its own
 * declaration. This produces one candidate per declaration site.
 *
 * Circular compose chains (A composes B, B composes A) are handled via a
 * visited-set guard.
 */
export const traceComposition = (
  hashedClass: string,
  manifest: CssModulesManifest,
): readonly ComposedCandidate[] => {
  const primaryEntries = manifest.lookupByHash(hashedClass);
  if (primaryEntries.length === 0) return [];

  const candidates: ComposedCandidate[] = [];
  const visited = new Set<string>();

  for (const entry of primaryEntries) {
    // The primary declaration (the class that was looked up directly).
    const key = `${entry.modulePath}:${entry.localName}`;
    if (!visited.has(key)) {
      visited.add(key);
      candidates.push({
        modulePath: entry.modulePath,
        localName: entry.localName,
        hashedName: hashedClass,
        isComposedTarget: false,
      });
    }

    // Trace compose targets — each additional hash in the composed value.
    for (const composedHash of entry.composedHashes) {
      if (composedHash === hashedClass) continue;
      const composedEntries = manifest.lookupByHash(composedHash);
      for (const ce of composedEntries) {
        const ckey = `${ce.modulePath}:${ce.localName}`;
        if (!visited.has(ckey)) {
          visited.add(ckey);
          candidates.push({
            modulePath: ce.modulePath,
            localName: ce.localName,
            hashedName: composedHash,
            isComposedTarget: true,
          });
        }
      }
    }
  }

  return candidates;
};
