/**
 * Source-mapping confidence scoring.
 *
 * DOM identity metadata can narrow source candidates, but it cannot prove a
 * concrete source range. Independent source-map and range resolution owns HIGH
 * confidence.
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
 * - `medium` — a source marker, stable selector (`id`, stable classes), or a
 *   semantic role was produced.
 * - `low` — only a brittle nth-child fallback selector is available.
 */
export function computeSourceConfidence(inputs: ConfidenceInputs): IdentityConfidence {
  if (
    inputs.attributes[SOURCE_MARKER_ATTR] !== undefined &&
    inputs.attributes[SOURCE_MARKER_ATTR].length > 0
  ) {
    return "medium";
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
