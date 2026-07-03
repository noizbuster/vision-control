import { CHANGE_IR_SCHEMA_VERSION, type ChangeSet } from "./changeset.js";
import { DEFAULT_VERIFICATION_PLAN } from "./context.js";
import type { Operation } from "./operations/index.js";
import { DEFAULT_PRIVACY_REPORT } from "./privacy.js";

export interface MergeConflict {
  readonly reason: string;
  readonly operationIds: readonly [string, string];
}

export type MergeResult =
  | { readonly ok: true; readonly changeSet: ChangeSet }
  | { readonly ok: false; readonly conflicts: readonly MergeConflict[] };

/**
 * Signature of the logical "slot" an operation edits. Two operations with the
 * same signature touch the same element property / structural slot and
 * conflict unless one is the documented inverse of the other. Returns
 * `undefined` for operations that cannot meaningfully conflict (none in the
 * MVP union, but the escape hatch keeps the function total).
 */
const conflictSignature = (op: Operation): string | undefined => {
  switch (op.kind) {
    case "style-edit":
      return `style:${op.target.runtimeId}:${op.property}`;
    case "text-edit":
      return `text:${op.target.runtimeId}`;
    case "class-add":
    case "class-remove":
      return `class:${op.target.runtimeId}:${op.className}`;
    case "class-replace":
      return `class:${op.target.runtimeId}:${op.oldClassName}`;
    case "resize-element":
      return `resize:${op.element.runtimeId}:${op.property}`;
    case "reorder-child":
      return `reorder:${op.parent.runtimeId}:${op.child.runtimeId}`;
    case "reparent-element":
      return `reparent:${op.element.runtimeId}`;
    case "set-container-layout":
      return `container-layout:${op.container.runtimeId}:${op.property}`;
    case "set-child-sizing":
      return `child-sizing:${op.container.runtimeId}:${op.childIndex}:${op.sizing}`;
    case "grid-reorder":
      return `grid-reorder:${op.grid.runtimeId}:${op.child.runtimeId}`;
    case "grid-span":
      return `grid-span:${op.grid.runtimeId}:${op.child.runtimeId}:${op.axis}`;
    case "breakpoint-style-edit":
      return `bp-style:${op.target.runtimeId}:${op.breakpoint}:${op.property}`;
    case "breakpoint-class-edit":
      return `bp-class:${op.target.runtimeId}:${op.breakpoint}:${op.oldClassName}`;
    case "breakpoint-text-edit":
      return `bp-text:${op.target.runtimeId}:${op.breakpoint}`;
    case "group-reorder":
      return `group-reorder:${op.parent.runtimeId}`;
    case "group-reparent":
      return `group-reparent:${op.elements[0]?.runtimeId ?? ""}`;
    default:
      // multi-select-group, align-elements, distribute-elements,
      // screenshot-crop-ref, and suggested-diff are metadata/no-op markers or
      // group-spanning ops that do not occupy a single conflicting slot.
      return undefined;
  }
};

const isInversePair = (a: Operation, b: Operation): boolean =>
  (b.inverseOf !== undefined && b.inverseOf === a.id) ||
  (a.inverseOf !== undefined && a.inverseOf === b.id);

/**
 * Merge two changesets into a new uncommitted one. Fails (returns conflicts)
 * when both sets edit the same element + property/slot without one being the
 * inverse of the other. Inverse pairs are allowed through (they cancel out).
 */
export const mergeChangeSets = (a: ChangeSet, b: ChangeSet): MergeResult => {
  const sigsA = new Map<string, Operation>();
  for (const op of a.operations) {
    const sig = conflictSignature(op);
    if (sig !== undefined) sigsA.set(sig, op);
  }
  const conflicts: MergeConflict[] = [];
  for (const opB of b.operations) {
    const sig = conflictSignature(opB);
    if (sig === undefined) continue;
    const opA = sigsA.get(sig);
    if (opA === undefined) continue;
    if (!isInversePair(opA, opB)) {
      conflicts.push({
        reason: `Conflicting edit on "${sig}" present in both changesets without an inverse`,
        operationIds: [opA.id, opB.id],
      });
    }
  }
  if (conflicts.length > 0) return { ok: false, conflicts };
  const now = Date.now();
  return {
    ok: true,
    changeSet: {
      schemaVersion: CHANGE_IR_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      workspaceId: a.workspaceId,
      sessionId: a.sessionId,
      page: a.page,
      viewport: a.viewport,
      createdAt: now,
      updatedAt: now,
      selectedTargets: [...a.selectedTargets, ...b.selectedTargets],
      operations: [...a.operations, ...b.operations],
      sourceResolutions: [],
      verificationPlan: DEFAULT_VERIFICATION_PLAN,
      privacyReport: DEFAULT_PRIVACY_REPORT,
      committed: false,
    },
  };
};

export interface SupersedeResult {
  readonly old: ChangeSet;
  readonly next: ChangeSet;
}

/**
 * Mark `old` as superseded by `next`: sets `old.supersededBy` to `next.id`.
 * Returns both so the caller can persist the updated pair. `next` is returned
 * unchanged.
 */
export const supersedeChangeSet = (old: ChangeSet, next: ChangeSet): SupersedeResult => ({
  old: { ...old, supersededBy: next.id, updatedAt: Date.now() },
  next,
});
