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
 * conflict unless one is a documented inverse of the other (structural or
 * `inverseOf`-linked). Returns `undefined` for operations that cannot
 * meaningfully conflict (metadata markers, group-spanning ops).
 */
const conflictSignature = (op: Operation): string | undefined => {
  switch (op.kind) {
    case "style-edit":
    case "remove-style":
      return `style:${op.target.runtimeId}:${op.property}`;
    case "text-edit":
      return `text:${op.target.runtimeId}`;
    case "class-add":
    case "class-remove":
      return `class:${op.target.runtimeId}:${op.className}`;
    case "class-replace":
      return `class:${op.target.runtimeId}:${op.oldClassName}`;
    case "set-attribute":
      return `attribute:${op.target.runtimeId}:${op.name}`;
    case "set-component-prop":
      return `component-prop:${op.target.runtimeId}:${op.componentName}:${op.propName}`;
    case "position-element":
      return `position:${op.target.runtimeId}:${op.property}`;
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
    case "insert-element":
      return `structural-element:${op.element.runtimeId}`;
    case "remove-element":
      return `structural-element:${op.element.runtimeId}`;
    case "duplicate-element":
      return `structural-element:${op.duplicate.runtimeId}`;
    case "wrap-elements":
      return `structural-wrapper:${op.wrapper.runtimeId}`;
    case "unwrap-element":
      return `structural-wrapper:${op.wrapper.runtimeId}`;
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
 * Two operations are structural inverses when they target the same element and
 * one undoes the other by construction: Insert↔Remove (same element),
 * Duplicate→Remove (of the copy), Wrap↔Unwrap (same wrapper). Unlike the
 * `inverseOf` link — which ties a {@link computeInverse} result to its source —
 * structural inverses are matched by target identity, so two independently
 * authored changesets can still cancel without a prior linking step.
 */
const structuralInversePair = (a: Operation, b: Operation): boolean => {
  if (a.kind === "insert-element" && b.kind === "remove-element") {
    return a.element.runtimeId === b.element.runtimeId;
  }
  if (a.kind === "remove-element" && b.kind === "insert-element") {
    return a.element.runtimeId === b.element.runtimeId;
  }
  if (a.kind === "duplicate-element" && b.kind === "remove-element") {
    return a.duplicate.runtimeId === b.element.runtimeId;
  }
  if (a.kind === "remove-element" && b.kind === "duplicate-element") {
    return a.element.runtimeId === b.duplicate.runtimeId;
  }
  if (a.kind === "wrap-elements" && b.kind === "unwrap-element") {
    return a.wrapper.runtimeId === b.wrapper.runtimeId;
  }
  if (a.kind === "unwrap-element" && b.kind === "wrap-elements") {
    return a.wrapper.runtimeId === b.wrapper.runtimeId;
  }
  return false;
};

/**
 * Cancel structural inverse pairs in a flat operation stream. When an
 * Insert+Remove, Duplicate+Remove, or Wrap+Unwrap target the same element,
 * both ops are dropped — their net effect is nil. Unmatched operations are
 * preserved in their original order; an op leaves the stream only because a
 * documented inverse cancelled it, never silently.
 */
export const mergeOperations = (operations: readonly Operation[]): Operation[] => {
  const cancelled = new Set<number>();
  for (let i = 0; i < operations.length; i++) {
    if (cancelled.has(i)) continue;
    const a = operations[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < operations.length; j++) {
      if (cancelled.has(j)) continue;
      const b = operations[j];
      if (b === undefined) continue;
      if (structuralInversePair(a, b)) {
        cancelled.add(i);
        cancelled.add(j);
        break;
      }
    }
  }
  return operations.filter((_, index) => !cancelled.has(index));
};

/**
 * Merge two changesets into a new uncommitted one. Fails (returns conflicts)
 * when both sets edit the same element + property/slot without one being the
 * inverse of the other. Structural inverse pairs (Insert+Remove, Duplicate+
 * Remove, Wrap+Unwrap on the same target) and `inverseOf`-linked pairs are
 * allowed through; structural pairs are then cancelled out of the result by
 * {@link mergeOperations} so the merged set carries only the net effect.
 */
export const mergeChangeSets = (a: ChangeSet, b: ChangeSet): MergeResult => {
  const sigsA = new Map<string, Operation[]>();
  for (const op of a.operations) {
    const sig = conflictSignature(op);
    if (sig === undefined) continue;
    const bucket = sigsA.get(sig);
    if (bucket === undefined) sigsA.set(sig, [op]);
    else bucket.push(op);
  }
  const conflicts: MergeConflict[] = [];
  for (const opB of b.operations) {
    const sig = conflictSignature(opB);
    if (sig === undefined) continue;
    const opAs = sigsA.get(sig);
    if (opAs === undefined) continue;
    const allowsThrough = opAs.some(
      (opA) => structuralInversePair(opA, opB) || isInversePair(opA, opB),
    );
    if (!allowsThrough) {
      const counterpart = opAs[0];
      if (counterpart === undefined) continue;
      conflicts.push({
        reason: `Conflicting edit on "${sig}" present in both changesets without an inverse`,
        operationIds: [counterpart.id, opB.id],
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
      operations: mergeOperations([...a.operations, ...b.operations]),
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
