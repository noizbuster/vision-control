import type { MultiSelectMember } from "@vision-control/element-identity";

/**
 * A single group-constraint failure. Codes are stable so callers (inspector,
 * overlay) can render dedicated affordances. The message is human-readable for
 * diagnostics and journal warnings.
 */
export interface ConstraintViolation {
  readonly code: "too-few-members" | "cross-frame" | "incompatible-shadow" | "duplicate-member";
  readonly message: string;
}

export type GroupConstraintResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly ConstraintViolation[] };

export const CONSTRAINT_MIN_MEMBERS = 2;

/**
 * Evaluate the multi-select group invariants (PRD V1 multi-select rules):
 *
 * - At least {@link CONSTRAINT_MIN_MEMBERS} members (a single element is just a
 *   regular selection, not a group).
 * - All members share the same frame (`frameId` + `frameKind`). Cross-origin
 *   iframes are never selectable: they are excluded from the `MultiSelectFrameKind`
 *   enum by construction, so any two members with differing frame metadata are a
 *   cross-frame violation.
 * - All members share a compatible shadow context. Either all in the light DOM
 *   or all in the same open shadow root. Closed shadow roots are never
 *   selectable (excluded from `MultiSelectShadowKind`); mixing light DOM with
 *   an open shadow root is rejected.
 * - No two members share a runtime id (a duplicate member is a stale/erroneous
 *   selection).
 *
 * Pure; no DOM access. Returns `{ ok: true }` when every invariant holds, or
 * `{ ok: false, violations }` with one entry per failing invariant.
 */
export const evaluateGroupConstraints = (
  members: readonly MultiSelectMember[],
): GroupConstraintResult => {
  const violations: ConstraintViolation[] = [];

  if (members.length < CONSTRAINT_MIN_MEMBERS) {
    violations.push({
      code: "too-few-members",
      message: `A multi-select group requires at least ${CONSTRAINT_MIN_MEMBERS} members (got ${members.length}).`,
    });
  }

  if (members.length > 0) {
    const first = members[0];
    if (first === undefined) {
      // Unreachable given length > 0; defensive for noUncheckedIndexedAccess.
      violations.push({ code: "cross-frame", message: "Empty member list." });
    } else {
      const sharedFrameId = first.frameId;
      const sharedFrameKind = first.frameKind;
      const sharedShadowKind = first.shadowKind;
      let frameMismatch = false;
      let shadowMismatch = false;
      for (let i = 1; i < members.length; i += 1) {
        const m = members[i];
        if (m === undefined) continue;
        if (m.frameId !== sharedFrameId || m.frameKind !== sharedFrameKind) frameMismatch = true;
        if (m.shadowKind !== sharedShadowKind) shadowMismatch = true;
      }
      if (frameMismatch) {
        violations.push({
          code: "cross-frame",
          message:
            "Members span different frames; one transform group cannot cross frame boundaries.",
        });
      }
      if (shadowMismatch) {
        violations.push({
          code: "incompatible-shadow",
          message:
            "Members mix incompatible shadow roots (light DOM with an open shadow root, or distinct roots).",
        });
      }
    }
  }

  // Duplicate runtime id detection (stale/erroneous selection).
  const seen = new Set<string>();
  let hasDuplicate = false;
  for (const m of members) {
    if (seen.has(m.runtimeId)) {
      hasDuplicate = true;
      break;
    }
    seen.add(m.runtimeId);
  }
  if (hasDuplicate) {
    violations.push({
      code: "duplicate-member",
      message:
        "Two members share a runtime id; the selection contains a stale or duplicate reference.",
    });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
};
