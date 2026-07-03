import type {
  ElementRef,
  MultiSelectFrameKind,
  MultiSelectGroupId,
  MultiSelectMember,
  MultiSelectShadowKind,
} from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";

import { computeBoundingRect } from "./bounding-rect.js";
import {
  type ConstraintViolation,
  evaluateGroupConstraints,
  type GroupConstraintResult,
} from "./group-constraints.js";

export { computeBoundingRect } from "./bounding-rect.js";
export {
  CONSTRAINT_MIN_MEMBERS,
  type ConstraintViolation,
  evaluateGroupConstraints,
  type GroupConstraintResult,
} from "./group-constraints.js";

/**
 * The canonical multi-select group shape. A group is NEVER a bare
 * `ElementRef[]`; it always carries the invariants that make it a single
 * transform context:
 *
 * - `id` — the stable {@link MultiSelectGroupId} (anchored by the journal's
 *   `multi-select-group` operation).
 * - `members` — the ordered list of selection-group members (min 2).
 * - `frameId` / `frameKind` — the single frame every member shares.
 * - `shadowKind` — the single shadow context every member shares.
 * - `shadowRootCompatible` — always `true` for a constructed group (the builder
 *   rejects incompatible members). Surfaced for downstream consumers that want
 *   a single boolean rather than re-running the checker.
 * - `commonParent` — the computed lowest common ancestor of the member parent
 *   chains (the shared layout context). `null` when the members share no
 *   ancestor.
 * - `boundingRect` — the computed bounding rectangle enclosing every member.
 *
 * The group is immutable: builders snapshot their inputs so later mutation of
 * caller-owned objects cannot poison the group (the stale_state invariant).
 */
export interface MultiSelectGroup {
  readonly id: MultiSelectGroupId;
  readonly members: readonly MultiSelectMember[];
  readonly frameId: string;
  readonly frameKind: MultiSelectFrameKind;
  readonly shadowKind: MultiSelectShadowKind;
  readonly shadowRootCompatible: true;
  readonly commonParent: ElementRef | null;
  readonly boundingRect: Rect;
}

export type CreateGroupResult =
  | { readonly ok: true; readonly group: MultiSelectGroup }
  | { readonly ok: false; readonly violations: readonly ConstraintViolation[] };

/**
 * Compute the lowest common ancestor across parent chains. Each chain is the
 * element ancestry ordered ROOT FIRST (matching the MVP breadcrumb order
 * `[rootAncestor, …, parent]`). The common parent is the deepest element
 * present in every chain; `null` when the chains diverge at the root or any
 * chain is empty.
 *
 * Members are compared by `runtimeId` (the per-DOM-instance identity). Pure.
 */
export const computeCommonParent = (
  parentChains: readonly (readonly ElementRef[])[],
): ElementRef | null => {
  if (parentChains.length === 0) return null;
  if (parentChains.some((chain) => chain.length === 0)) return null;

  let common: ElementRef | null = null;
  const minLen = parentChains.reduce(
    (min, chain) => Math.min(min, chain.length),
    Number.POSITIVE_INFINITY,
  );
  for (let depth = 0; depth < minLen; depth += 1) {
    const candidate = parentChains[0]?.[depth];
    if (candidate === undefined) break;
    const allAgree = parentChains.every((chain) => chain[depth]?.runtimeId === candidate.runtimeId);
    if (!allAgree) break;
    common = candidate;
  }
  return common;
};

/** Inputs to {@link createMultiSelectGroup}. */
export interface CreateMultiSelectGroupInput {
  readonly id: MultiSelectGroupId;
  readonly members: readonly MultiSelectMember[];
  /** Per-member client rects, parallel to `members`. */
  readonly memberRects: readonly Rect[];
  /**
   * Per-member ancestry (root first), parallel to `members`. Used to compute
   * the common parent layout context. May be empty per member (no ancestry
   * known) — then `commonParent` is `null`.
   */
  readonly parentChains: readonly (readonly ElementRef[])[];
}

/**
 * Build a {@link MultiSelectGroup} from raw member data. Runs the full
 * constraint check first; returns `{ ok: false, violations }` (never throws)
 * when the group invariants fail — frame mismatch, incompatible shadow roots,
 * too few members, or duplicate runtime ids. On success the returned group
 * snapshots its members so later caller mutation is harmless.
 */
export const createMultiSelectGroup = (input: CreateMultiSelectGroupInput): CreateGroupResult => {
  const constraints: GroupConstraintResult = evaluateGroupConstraints(input.members);
  if (!constraints.ok) {
    return { ok: false, violations: constraints.violations };
  }

  // Snapshot members so external mutation cannot poison the group (stale_state).
  const members: readonly MultiSelectMember[] = input.members.map((m) => ({ ...m }));
  const first = members[0];
  // Guaranteed by the constraint check (min 2 members), but guard for
  // noUncheckedIndexedAccess.
  if (first === undefined) {
    return {
      ok: false,
      violations: [{ code: "too-few-members", message: "No members provided." }],
    };
  }

  const boundingRect = computeBoundingRect(input.memberRects);
  if (boundingRect === null) {
    return {
      ok: false,
      violations: [
        { code: "too-few-members", message: "No member rects provided to compute a bounding box." },
      ],
    };
  }

  const group: MultiSelectGroup = {
    id: input.id,
    members,
    frameId: first.frameId,
    frameKind: first.frameKind,
    shadowKind: first.shadowKind,
    shadowRootCompatible: true,
    commonParent: computeCommonParent(input.parentChains),
    boundingRect,
  };
  return { ok: true, group };
};
