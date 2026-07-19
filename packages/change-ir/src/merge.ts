import { CHANGE_IR_SCHEMA_VERSION, type ChangeSet } from "./changeset.js";
import { conflictSignatures } from "./conflict-signatures.js";
import { DEFAULT_VERIFICATION_PLAN } from "./context.js";
import { type ElementIdentity, sameElementIdentity } from "./element-identity.js";
import { createOperationId } from "./operation-base.js";
import type { Operation } from "./operations/index.js";
import { DEFAULT_PRIVACY_REPORT } from "./privacy.js";

export interface MergeConflict {
  readonly reason: string;
  readonly operationIds: readonly [string, string];
}

export type MergeResult =
  | { readonly ok: true; readonly changeSet: ChangeSet }
  | { readonly ok: false; readonly conflicts: readonly MergeConflict[] };

const isInversePair = (a: Operation, b: Operation): boolean =>
  (b.inverseOf !== undefined && b.inverseOf === a.id) ||
  (a.inverseOf !== undefined && a.inverseOf === b.id);

type CssConflictSlot = {
  readonly element: ElementIdentity;
  readonly property: string;
};

const cssConflictSlots = (operation: Operation): readonly CssConflictSlot[] => {
  switch (operation.kind) {
    case "style-edit":
    case "remove-style":
      return [{ element: operation.target, property: operation.property }];
    case "resize-element":
      return [{ element: operation.element, property: operation.property }];
    case "resize-flex-pair":
      return operation.members.flatMap((member) =>
        ["flex-grow", "flex-shrink", "flex-basis"].map((property) => ({
          element: member.element,
          property,
        })),
      );
    default:
      return [];
  }
};

const flexPairAliasSignature = (a: Operation, b: Operation): string | undefined => {
  if (a.kind !== "resize-flex-pair" && b.kind !== "resize-flex-pair") return undefined;
  for (const slotA of cssConflictSlots(a)) {
    for (const slotB of cssConflictSlots(b)) {
      if (slotA.property === slotB.property && sameElementIdentity(slotA.element, slotB.element)) {
        return `css:${slotA.element.runtimeId}:${slotA.property}`;
      }
    }
  }
  return undefined;
};

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
    for (const signature of conflictSignatures(op)) {
      const bucket = sigsA.get(signature);
      if (bucket === undefined) sigsA.set(signature, [op]);
      else bucket.push(op);
    }
  }
  const conflicts: MergeConflict[] = [];
  for (const opB of b.operations) {
    for (const signature of conflictSignatures(opB)) {
      const opAs = sigsA.get(signature);
      if (opAs === undefined) continue;
      const counterpart = opAs.find(
        (opA) => !structuralInversePair(opA, opB) && !isInversePair(opA, opB),
      );
      if (counterpart !== undefined) {
        conflicts.push({
          reason: `Conflicting edit on "${signature}" present in both changesets without an inverse`,
          operationIds: [counterpart.id, opB.id],
        });
      }
    }
    for (const opA of a.operations) {
      const signature = flexPairAliasSignature(opA, opB);
      if (
        signature !== undefined &&
        !isInversePair(opA, opB) &&
        !conflicts.some(
          (conflict) => conflict.operationIds[0] === opA.id && conflict.operationIds[1] === opB.id,
        )
      ) {
        conflicts.push({
          reason: `Conflicting edit on "${signature}" present in both changesets without an inverse`,
          operationIds: [opA.id, opB.id],
        });
      }
    }
  }
  if (conflicts.length > 0) return { ok: false, conflicts };
  const now = Date.now();
  return {
    ok: true,
    changeSet: {
      schemaVersion: CHANGE_IR_SCHEMA_VERSION,
      id: createOperationId(),
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
