/**
 * Source-mapping confidence scoring.
 *
 * Computes a confidence level for how well the inspected element maps back to
 * source. This is a placeholder until task 22/23 provide real source-marker
 * data; the rules mirror the priority order in element-identity/selectors.ts.
 */

import type { IdentityConfidence } from "@vision-control/element-identity";

const SOURCE_MARKER_ATTR = "data-vc-source";

/** Inputs required to score confidence. */
export interface ConfidenceInputs {
  readonly attributes: Readonly<Record<string, string>>;
  readonly id: string;
  readonly className: string;
  readonly role: string | undefined;
  readonly selector: string;
}

/**
 * Compute confidence from element identity data.
 *
 * - `high` — the element carries a `data-vc-source` source marker.
 * - `medium` — no source marker, but a stable selector (`id`, stable classes)
 *   or a semantic role/name was produced.
 * - `low` — only a brittle nth-child fallback selector is available.
 */
export function computeSourceConfidence(inputs: ConfidenceInputs): IdentityConfidence {
  if (
    inputs.attributes[SOURCE_MARKER_ATTR] !== undefined &&
    inputs.attributes[SOURCE_MARKER_ATTR].length > 0
  ) {
    return "high";
  }

  if (inputs.id.length > 0 || hasStableClass(inputs.className) || inputs.role !== undefined) {
    return "medium";
  }

  return "low";
}

function hasStableClass(className: string): boolean {
  const classes = className.split(/\s+/).filter((c) => c.length > 0);
  return classes.length > 0 && classes.some((c) => !isVolatileClass(c));
}

function isVolatileClass(cls: string): boolean {
  return (
    /__[a-z0-9]{5,}/i.test(cls) ||
    /^sc-[a-z0-9]/i.test(cls) ||
    /^css-[a-z0-9]/i.test(cls) ||
    /^[a-z0-9]{6,}$/i.test(cls)
  );
}
