import type { ElementRef } from "@vision-control/element-identity";
import type { Point, Rect } from "@vision-control/geometry";

import type { SnapAxis, SnapCandidate, SnapKind } from "./snap-candidate.js";

/**
 * Snap candidate computation engine (PRD section 9.8).
 *
 * The engine is pure, DOM-free, and ADVISORY: it proposes candidates sorted by
 * pointer distance; a caller applies a snap only when `distance` is below its
 * threshold. No snap is ever forced.
 *
 * Sources (PRD §9.8:710-718): parent edge/center, sibling edge/center,
 * baseline, explicit grid line, configurable 4px/8px grid, spacing token.
 */

/** A box that can generate snap candidates (the target, its parent, a sibling). */
export interface SnapBox {
  /** Box geometry in the caller's coordinate space. */
  readonly rect: Rect;
  /** Element reference for attribution on `source`; optional for the target. */
  readonly ref?: ElementRef;
  /**
   * Inline baseline y-coordinate. Set on text-bearing siblings so their
   * baseline can be matched; ignored on the target box.
   */
  readonly baseline?: number;
}

/** Explicit grid lines (PRD §9.8 "grid line"). Lines are absolute coordinates. */
export interface SnapGridLines {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/** A named spacing/design token (PRD §9.8 "spacing token" / "design token value"). */
export interface SnapSpacingToken {
  /** Token name, surfaced on `SnapCandidate.token`. */
  readonly name: string;
  /** Token value in px (a positive spacing distance). */
  readonly value: number;
}

/**
 * Engine configuration.
 *
 * - `threshold` — max pointer-to-line distance for a candidate to be proposed.
 *   Candidates beyond it are filtered out (so a pointer far from every source
 *   yields an empty list). The caller re-checks `distance < threshold` (strict
 *   less-than) before applying a snap.
 * - `gridSpacing` — the configurable 4px/8px grid (PRD §9.8). When set, the
 *   engine emits the nearest grid line on each axis.
 * - `gridOrigin` — grid origin offset (default `{x:0,y:0}`).
 */
export interface SnapConfig {
  readonly threshold: number;
  readonly gridSpacing?: number;
  readonly gridOrigin?: Point;
}

/** Pure input to {@link computeSnapCandidates}. */
export interface SnapInput {
  /** The element being dragged. Used for attribution and baseline matching. */
  readonly target: SnapBox;
  /** Current pointer position; the reference point for every `distance`. */
  readonly pointer: Point;
  /** Parent/container box; emits edge and center candidates when present. */
  readonly parent?: SnapBox;
  /** Sibling boxes; emit edge, center, baseline, and spacing-token candidates. */
  readonly siblings?: readonly SnapBox[];
  /** Explicit grid lines (PRD §9.8 "grid line"). */
  readonly gridLines?: SnapGridLines;
  /** Design/spacing tokens (PRD §9.8 "spacing token"). */
  readonly tokens?: readonly SnapSpacingToken[];
  readonly config: SnapConfig;
}

/** Internal pre-scoring shape: a candidate before distance is computed. */
interface RawCandidate {
  readonly axis: SnapAxis;
  readonly kind: SnapKind;
  readonly value: number;
  readonly source?: ElementRef;
  readonly token?: string;
}

/**
 * Build a raw candidate, attaching `source`/`token` only when present (required
 * by `exactOptionalPropertyTypes`: optionals must be absent, not `undefined`).
 */
const raw = (
  axis: SnapAxis,
  kind: SnapKind,
  value: number,
  source?: ElementRef,
  token?: string,
): RawCandidate => {
  const base: RawCandidate = { axis, kind, value };
  if (source !== undefined && token !== undefined) return { ...base, source, token };
  if (source !== undefined) return { ...base, source };
  if (token !== undefined) return { ...base, token };
  return base;
};

/** Push edge and (optionally) center candidates for a box on both axes. */
const pushBoxCandidates = (out: RawCandidate[], box: SnapBox, includeCenter: boolean): void => {
  const r = box.rect;
  const source = box.ref;
  // x-axis: leading and trailing edges.
  out.push(raw("x", "edge", r.x, source));
  out.push(raw("x", "edge", r.x + r.width, source));
  // y-axis: leading and trailing edges.
  out.push(raw("y", "edge", r.y, source));
  out.push(raw("y", "edge", r.y + r.height, source));
  if (includeCenter) {
    out.push(raw("x", "center", r.x + r.width / 2, source));
    out.push(raw("y", "center", r.y + r.height / 2, source));
  }
};

/** Push spacing-token candidates around a sibling: gap before/after each axis. */
const pushSpacingTokenCandidates = (
  out: RawCandidate[],
  sibling: SnapBox,
  token: SnapSpacingToken,
): void => {
  const r = sibling.rect;
  const source = sibling.ref;
  // x-axis: one token-width gap to the left of the leading edge / right of the
  // trailing edge. The candidate value is where the target's near edge would
  // sit so the gap between target and sibling equals the token.
  out.push(raw("x", "spacing-token", r.x - token.value, source, token.name));
  out.push(raw("x", "spacing-token", r.x + r.width + token.value, source, token.name));
  // y-axis: same, above/below.
  out.push(raw("y", "spacing-token", r.y - token.value, source, token.name));
  out.push(raw("y", "spacing-token", r.y + r.height + token.value, source, token.name));
};

/** Collect every raw candidate from all configured sources. */
const collectRaw = (input: SnapInput): RawCandidate[] => {
  const out: RawCandidate[] = [];

  if (input.parent !== undefined) {
    pushBoxCandidates(out, input.parent, true);
  }

  for (const sibling of input.siblings ?? []) {
    pushBoxCandidates(out, sibling, true);
    if (sibling.baseline !== undefined) {
      out.push(raw("y", "baseline", sibling.baseline, sibling.ref));
    }
    for (const token of input.tokens ?? []) {
      pushSpacingTokenCandidates(out, sibling, token);
    }
  }

  if (input.gridLines !== undefined) {
    for (const x of input.gridLines.x) out.push(raw("x", "grid", x));
    for (const y of input.gridLines.y) out.push(raw("y", "grid", y));
  }

  const spacing = input.config.gridSpacing;
  if (spacing !== undefined && spacing > 0) {
    const ox = input.config.gridOrigin?.x ?? 0;
    const oy = input.config.gridOrigin?.y ?? 0;
    const nearestX = ox + Math.round((input.pointer.x - ox) / spacing) * spacing;
    const nearestY = oy + Math.round((input.pointer.y - oy) / spacing) * spacing;
    out.push(raw("x", "grid", nearestX));
    out.push(raw("y", "grid", nearestY));
  }

  return out;
};

/**
 * Compute advisory snap candidates (PRD §9.8).
 *
 * Pipeline: collect raw candidates from every source → score each by absolute
 * pointer-to-line distance on its axis → drop those beyond `config.threshold`
 * → sort ascending by distance. The result is the caller's proposal set; the
 * caller applies a snap only when `distance` is below its own (strict) gate.
 *
 * A pointer far from every source (and with no configurable grid) yields an
 * empty list — there is nothing to propose.
 */
export const computeSnapCandidates = (input: SnapInput): readonly SnapCandidate[] => {
  const threshold = input.config.threshold;
  const scored: SnapCandidate[] = [];

  for (const candidate of collectRaw(input)) {
    const pointerValue = candidate.axis === "x" ? input.pointer.x : input.pointer.y;
    const distance = Math.abs(pointerValue - candidate.value);
    if (distance <= threshold) {
      scored.push({ ...candidate, distance });
    }
  }

  scored.sort((a, b) => a.distance - b.distance);
  return scored;
};
