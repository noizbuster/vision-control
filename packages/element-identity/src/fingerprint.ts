/**
 * DOM path fingerprint for stale detection — pure, DOM-free.
 *
 * A fingerprint is a deterministic hash of an element's tag ancestry plus a
 * stable subset of attributes. After HMR/reload, the verification engine
 * recomputes the fingerprint for a candidate element; if it differs from the
 * captured one, the DOM structure changed and the identity is stale (PRD 18.3).
 *
 * The hash is FNV-1a 32-bit: pure, dependency-free, deterministic across
 * processes. It is NOT a security primitive — it only needs to collide rarely
 * for distinct DOM paths, which FNV-1a handles well.
 */

import type { ElementDescriptor } from "./selectors.js";

/** Subset of attributes that participate in the fingerprint (stable signals). */
const FINGERPRINTED_ATTRS = ["id", "data-vc-source", "role", "name", "data-testid"] as const;

/**
 * Build the canonical string that the hash is taken over. Deterministic:
 * ancestry tag path + the element tag + a sorted, fixed-set of attribute
 * key=value pairs. Only stable attributes contribute (class names are
 * excluded because generated classes change across builds).
 */
const canonicalFingerprintString = (descriptor: ElementDescriptor): string => {
  const ancestryPath = (descriptor.ancestry ?? []).map((a) => a.tagName.toLowerCase()).join("/");
  const tag = descriptor.tagName.toLowerCase();
  const attrs: string[] = [];
  if (descriptor.attributes !== undefined) {
    for (const name of FINGERPRINTED_ATTRS) {
      const value = descriptor.attributes[name];
      if (value !== undefined) attrs.push(`${name}=${value}`);
    }
  }
  return `${ancestryPath}/${tag}|${attrs.join("|")}`;
};

/**
 * FNV-1a 32-bit hash. Returns an 8-character lowercase hex string. Pure and
 * deterministic; no crypto, no globals.
 */
const fnv1a32 = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * Compute a DOM path fingerprint for an element. Pure; never touches the DOM.
 * Two elements with the same ancestry tag path and the same stable-attribute
 * subset produce the same fingerprint.
 */
export const computeFingerprint = (descriptor: ElementDescriptor): string =>
  fnv1a32(canonicalFingerprintString(descriptor));
