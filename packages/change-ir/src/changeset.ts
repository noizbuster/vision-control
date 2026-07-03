import { z } from "zod";
import { OPERATION_ID_PATTERN } from "./operation-base.js";
import { type Operation, OperationSchema } from "./operations/index.js";

const ID = z.string().regex(OPERATION_ID_PATTERN);

/**
 * change-ir schema version. v1.0.0 = the 8 MVP kinds. v1.1.0 added the 14 V1
 * kinds (multi-select, group, layout, grid, breakpoint, screenshot-ref,
 * suggested-diff) — additive, no breaking shape change. See `src/SCHEMA_VERSION.md`.
 */
export const CHANGE_IR_SCHEMA_VERSION = "1.1.0";

/**
 * A ChangeSet is the unit of grouped visual operations for one editing session.
 * Operations are append-only; `committed` marks the set as finalized for
 * source resolution, and `supersededBy` marks it as replaced by a newer set.
 */
export const ChangeSetSchema = z.object({
  id: ID,
  sessionId: ID,
  operations: z.array(OperationSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  committed: z.boolean(),
  /** Present when another changeset has superseded this one (merge/supersede). */
  supersededBy: ID.optional(),
});

export type ChangeSet = z.infer<typeof ChangeSetSchema>;

export interface CreateChangeSetOptions {
  readonly sessionId: string;
  readonly id?: string;
  readonly now?: number;
}

/**
 * Create an empty, uncommitted ChangeSet. `id` and `now` default to a fresh
 * UUID and `Date.now()`; pass them explicitly for deterministic tests.
 */
export const createChangeSet = (options: CreateChangeSetOptions): ChangeSet => {
  const now = options.now ?? Date.now();
  return {
    id: options.id ?? crypto.randomUUID(),
    sessionId: options.sessionId,
    operations: [],
    createdAt: now,
    updatedAt: now,
    committed: false,
  };
};

/** Append an operation and bump `updatedAt`. Does not mutate the input. */
export const appendOperation = (cs: ChangeSet, op: Operation): ChangeSet => ({
  ...cs,
  operations: [...cs.operations, op],
  updatedAt: Date.now(),
});

/** Remove an operation by id and bump `updatedAt`. Does not mutate the input. */
export const removeOperation = (cs: ChangeSet, opId: string): ChangeSet => ({
  ...cs,
  operations: cs.operations.filter((op) => op.id !== opId),
  updatedAt: Date.now(),
});

const newOperationId = (): string => crypto.randomUUID();

/**
 * Compute the operation that undoes `op`.
 *
 * The returned operation carries a fresh `id`, `inverseOf: op.id` (linking the
 * inverse back to the original), and a fresh `timestamp`. The `runtime` flag is
 * PRESERVED: the inverse of a runtime preview mutation is itself a preview
 * mutation — undoing a transform preview does not turn it into source intent
 * (PRD §12.5, Appendix D.1).
 *
 * Every operation kind has a defined inverse; the switch is exhaustive. Adding
 * a kind without an inverse branch is a compile error (the `default` becomes
 * reachable).
 */
export const computeInverse = (op: Operation): Operation => {
  const base = {
    id: newOperationId(),
    inverseOf: op.id,
    timestamp: Date.now(),
    runtime: op.runtime,
  };
  switch (op.kind) {
    case "style-edit":
      return {
        ...base,
        kind: "style-edit",
        target: op.target,
        property: op.property,
        // previousValue is required for a lossless inverse; the journal always
        // captures it. Fall back to "" for ops constructed without it.
        value: op.previousValue ?? "",
        important: op.important,
        previousValue: op.value,
      };
    case "text-edit":
      return {
        ...base,
        kind: "text-edit",
        target: op.target,
        newText: op.previousText ?? "",
        previousText: op.newText,
      };
    case "class-add":
      return { ...base, kind: "class-remove", target: op.target, className: op.className };
    case "class-remove":
      return { ...base, kind: "class-add", target: op.target, className: op.className };
    case "class-replace":
      return {
        ...base,
        kind: "class-replace",
        target: op.target,
        oldClassName: op.newClassName,
        newClassName: op.oldClassName,
      };
    case "reorder-child":
      return {
        ...base,
        kind: "reorder-child",
        parent: op.parent,
        child: op.child,
        fromIndex: op.toIndex,
        toIndex: op.fromIndex,
      };
    case "reparent-element":
      return {
        ...base,
        kind: "reparent-element",
        element: op.element,
        sourceParent: op.targetParent,
        sourceIndex: op.targetIndex,
        targetParent: op.sourceParent,
        targetIndex: op.sourceIndex,
      };
    case "resize-element":
      return {
        ...base,
        kind: "resize-element",
        element: op.element,
        property: op.property,
        fromValue: op.toValue,
        toValue: op.fromValue,
        unit: op.unit,
      };
    case "multi-select-group":
      return {
        ...base,
        kind: "multi-select-group",
        targets: op.previousTargets ?? [],
        groupId: op.groupId,
        previousTargets: op.targets,
      };
    case "group-reorder":
      return {
        ...base,
        kind: "group-reorder",
        parent: op.parent,
        children: op.children,
        previousOrder: op.newOrder,
        newOrder: op.previousOrder,
      };
    case "group-reparent":
      return {
        ...base,
        kind: "group-reparent",
        elements: op.elements,
        sourceParent: op.targetParent,
        sourceIndices: op.targetIndices,
        targetParent: op.sourceParent,
        targetIndices: op.sourceIndices,
      };
    case "align-elements":
      return {
        ...base,
        kind: "align-elements",
        targets: op.targets,
        alignment: op.alignment,
        previousValues: op.newValues,
        newValues: op.previousValues,
      };
    case "distribute-elements":
      return {
        ...base,
        kind: "distribute-elements",
        targets: op.targets,
        axis: op.axis,
        mode: op.mode,
        previousGaps: op.newGaps,
        newGaps: op.previousGaps,
      };
    case "set-container-layout":
      return {
        ...base,
        kind: "set-container-layout",
        container: op.container,
        property: op.property,
        value: op.previousValue ?? "",
        previousValue: op.value,
      };
    case "set-child-sizing":
      return {
        ...base,
        kind: "set-child-sizing",
        container: op.container,
        childIndex: op.childIndex,
        child: op.child,
        sizing: op.previousSizing ?? op.sizing,
        previousSizing: op.sizing,
        ...(op.previousValue !== undefined || op.value !== undefined
          ? { value: op.previousValue, previousValue: op.value }
          : {}),
      };
    case "grid-reorder":
      return {
        ...base,
        kind: "grid-reorder",
        grid: op.grid,
        child: op.child,
        placement: op.placement,
        fromIndex: op.toIndex,
        toIndex: op.fromIndex,
        ...(op.newGridArea !== undefined || op.previousGridArea !== undefined
          ? { previousGridArea: op.newGridArea, newGridArea: op.previousGridArea }
          : {}),
      };
    case "grid-span":
      return {
        ...base,
        kind: "grid-span",
        grid: op.grid,
        child: op.child,
        axis: op.axis,
        fromSpan: op.toSpan,
        toSpan: op.fromSpan,
      };
    case "breakpoint-style-edit":
      return {
        ...base,
        kind: "breakpoint-style-edit",
        target: op.target,
        breakpoint: op.breakpoint,
        ...(op.mediaSource !== undefined ? { mediaSource: op.mediaSource } : {}),
        ...(op.activeViewport !== undefined ? { activeViewport: op.activeViewport } : {}),
        ...(op.responsivePrefix !== undefined ? { responsivePrefix: op.responsivePrefix } : {}),
        ...(op.applyToBase !== undefined ? { applyToBase: op.applyToBase } : {}),
        property: op.property,
        value: op.previousValue ?? "",
        important: op.important,
        previousValue: op.value,
      };
    case "breakpoint-class-edit":
      return {
        ...base,
        kind: "breakpoint-class-edit",
        target: op.target,
        breakpoint: op.breakpoint,
        ...(op.mediaSource !== undefined ? { mediaSource: op.mediaSource } : {}),
        ...(op.activeViewport !== undefined ? { activeViewport: op.activeViewport } : {}),
        ...(op.responsivePrefix !== undefined ? { responsivePrefix: op.responsivePrefix } : {}),
        ...(op.applyToBase !== undefined ? { applyToBase: op.applyToBase } : {}),
        oldClassName: op.newClassName,
        newClassName: op.oldClassName,
      };
    case "breakpoint-text-edit":
      return {
        ...base,
        kind: "breakpoint-text-edit",
        target: op.target,
        breakpoint: op.breakpoint,
        ...(op.mediaSource !== undefined ? { mediaSource: op.mediaSource } : {}),
        ...(op.activeViewport !== undefined ? { activeViewport: op.activeViewport } : {}),
        ...(op.responsivePrefix !== undefined ? { responsivePrefix: op.responsivePrefix } : {}),
        ...(op.applyToBase !== undefined ? { applyToBase: op.applyToBase } : {}),
        newText: op.previousText ?? "",
        previousText: op.newText,
      };
    case "screenshot-crop-ref":
      // No-op marker: the screenshot ref is metadata, not a state change.
      return {
        ...base,
        kind: "screenshot-crop-ref",
        target: op.target,
        artifactId: op.artifactId,
        captureRegion: op.captureRegion,
        ...(op.redactionReport !== undefined ? { redactionReport: op.redactionReport } : {}),
        ...(op.retentionExpiresAt !== undefined
          ? { retentionExpiresAt: op.retentionExpiresAt }
          : {}),
      };
    case "suggested-diff":
      // No-op marker: the suggestion is inert metadata, not a state change.
      return {
        ...base,
        kind: "suggested-diff",
        ...(op.target !== undefined ? { target: op.target } : {}),
        diff: op.diff,
        sourceRanges: op.sourceRanges,
        confidence: op.confidence,
        preconditions: op.preconditions,
        applied: false,
      };
    default: {
      // Exhaustiveness guard: a new kind without a branch is a compile error.
      const exhaustive: never = op;
      throw new Error(`computeInverse: unhandled operation kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};
