import { z } from "zod";
import {
  DEFAULT_PAGE_CONTEXT,
  DEFAULT_VERIFICATION_PLAN,
  DEFAULT_VIEWPORT_CONTEXT,
  type PageContext,
  PageContextSchema,
  SourceResolutionSchema,
  VerificationPlanSchema,
  type ViewportContext,
  ViewportContextSchema,
} from "./context.js";
import { ElementRefSchema } from "./element-ref.js";
import { OPERATION_ID_PATTERN } from "./operation-base.js";
import { type Operation, OperationSchema } from "./operations/index.js";
import { DEFAULT_PRIVACY_REPORT, type PrivacyReport, PrivacyReportSchema } from "./privacy.js";

const ID = z.string().regex(OPERATION_ID_PATTERN);

/**
 * change-ir schema version. v1.0.0 = the 8 MVP kinds. v1.1.0 added the 14 V1
 * kinds (additive). v2.0.0 reshaped the ChangeSet container to the full PRD
 * §12.2 shape (schemaVersion, workspaceId, page, viewport, selectedTargets,
 * sourceResolutions, verificationPlan, privacyReport). See
 * `src/SCHEMA_VERSION.md` and {@link migrateChangeset_1_to_2}.
 */
export const CHANGE_IR_SCHEMA_VERSION = "2.0.0" as const;

/**
 * A ChangeSet is the unit of grouped visual operations for one editing session
 * (PRD §12.2). Carries the page/viewport context the set was captured in, the
 * selected targets and their source resolutions, the operations, and the
 * verification + privacy reports. Operations are append-only; `committed` marks
 * the set as finalized for source resolution, and `supersededBy` marks it as
 * replaced by a newer set (both carried forward from v1).
 */
export const ChangeSetSchema = z.object({
  schemaVersion: z.literal(CHANGE_IR_SCHEMA_VERSION),
  id: ID,
  workspaceId: z.string().min(1),
  sessionId: ID,
  page: PageContextSchema,
  viewport: ViewportContextSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  /** Optional human-readable label for the set. */
  title: z.string().optional(),
  /** Optional natural-language instruction that produced the set. */
  userInstruction: z.string().optional(),
  selectedTargets: z.array(ElementRefSchema),
  operations: z.array(OperationSchema),
  sourceResolutions: z.array(SourceResolutionSchema),
  verificationPlan: VerificationPlanSchema,
  privacyReport: PrivacyReportSchema,
  committed: z.boolean(),
  /** Present when another changeset has superseded this one (merge/supersede). */
  supersededBy: ID.optional(),
});

export type ChangeSet = z.infer<typeof ChangeSetSchema>;

export interface CreateChangeSetOptions {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly id?: string;
  readonly now?: number;
  readonly page?: PageContext;
  readonly viewport?: ViewportContext;
  readonly title?: string;
  readonly userInstruction?: string;
}

/**
 * Create an empty, uncommitted ChangeSet. `id` and `now` default to a fresh
 * UUID and `Date.now()`; pass them explicitly for deterministic tests. Page and
 * viewport default to sentinels (`<unknown>` / 0x0); pass them for real context.
 * The verification plan and privacy report default to empty stubs the engines
 * overwrite when they run.
 */
export const createChangeSet = (options: CreateChangeSetOptions): ChangeSet => {
  const now = options.now ?? Date.now();
  return {
    schemaVersion: CHANGE_IR_SCHEMA_VERSION,
    id: options.id ?? crypto.randomUUID(),
    workspaceId: options.workspaceId,
    sessionId: options.sessionId,
    page: options.page ?? DEFAULT_PAGE_CONTEXT,
    viewport: options.viewport ?? DEFAULT_VIEWPORT_CONTEXT,
    createdAt: now,
    updatedAt: now,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.userInstruction !== undefined ? { userInstruction: options.userInstruction } : {}),
    selectedTargets: [],
    operations: [],
    sourceResolutions: [],
    verificationPlan: DEFAULT_VERIFICATION_PLAN,
    privacyReport: DEFAULT_PRIVACY_REPORT,
    committed: false,
  };
};

/**
 * Permissive reader for the v1 ChangeSet shape (no `schemaVersion`, no PRD §12.2
 * context fields). Used by {@link migrateChangeset_1_to_2}. `passthrough` keeps
 * any extra keys so a v1 document that already carries some v2-adjacent data
 * (e.g. `workspaceId`, `title`) is preserved.
 */
const V1_CHANGESET_READER = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    operations: z.array(OperationSchema).default([]),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    committed: z.boolean().default(false),
    supersededBy: z.string().optional(),
    workspaceId: z.string().optional(),
    title: z.string().optional(),
    userInstruction: z.string().optional(),
    selectedTargets: z.array(ElementRefSchema).default([]),
    sourceResolutions: z.array(SourceResolutionSchema).default([]),
  })
  .passthrough();

/**
 * Migrate a v1 (schema ≤ 1.1.0) ChangeSet JSON document to a valid v2.0.0
 * ChangeSet, applying the R8 binding defaults for the PRD §12.2 fields v1 did
 * not carry (visible in the body below). `workspaceId` defaults to the
 * `"<unknown>"` sentinel — R8 leaves it unspecified, matching the page-url
 * default. The result is re-validated through {@link ChangeSetSchema} so a
 * malformed v1 document surfaces as a Zod error, not a silently-broken v2 set.
 */
export const migrateChangeset_1_to_2 = (v1Json: unknown): ChangeSet => {
  const v1 = V1_CHANGESET_READER.parse(v1Json);
  return ChangeSetSchema.parse({
    schemaVersion: CHANGE_IR_SCHEMA_VERSION,
    id: v1.id,
    workspaceId: v1.workspaceId ?? "<unknown>",
    sessionId: v1.sessionId,
    page: DEFAULT_PAGE_CONTEXT,
    viewport: DEFAULT_VIEWPORT_CONTEXT,
    createdAt: v1.createdAt,
    updatedAt: v1.updatedAt,
    ...(v1.title !== undefined ? { title: v1.title } : {}),
    ...(v1.userInstruction !== undefined ? { userInstruction: v1.userInstruction } : {}),
    selectedTargets: v1.selectedTargets,
    operations: v1.operations,
    sourceResolutions: v1.sourceResolutions,
    verificationPlan: {
      assertions: [],
      notes: "migrated from v1 — recompile via verification engine",
    },
    privacyReport: {
      redactions: [],
      totalRedacted: 0,
      note: "migrated v1 — recompute via redaction engine",
    },
    committed: v1.committed,
    ...(v1.supersededBy !== undefined ? { supersededBy: v1.supersededBy } : {}),
  });
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

/**
 * Stamp a computed {@link PrivacyReport} onto the set, replacing the
 * {@link DEFAULT_PRIVACY_REPORT} baseline. Does not mutate the input. The
 * report is produced by `@vision-control/context-compiler#computeChangesetPrivacyReport`.
 */
export const withPrivacyReport = (cs: ChangeSet, report: PrivacyReport): ChangeSet => ({
  ...cs,
  privacyReport: report,
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
    origin: op.origin,
    ...(op.breakpoint !== undefined ? { breakpoint: op.breakpoint } : {}),
    ...(op.pseudoState !== undefined ? { pseudoState: op.pseudoState } : {}),
    ...(op.notes !== undefined ? { notes: op.notes } : {}),
  };
  switch (op.kind) {
    case "style-edit":
      return {
        ...base,
        kind: "style-edit",
        confidence: op.confidence,
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
        confidence: op.confidence,
        target: op.target,
        newText: op.previousText ?? "",
        previousText: op.newText,
      };
    case "class-add":
      return {
        ...base,
        kind: "class-remove",
        confidence: op.confidence,
        target: op.target,
        className: op.className,
      };
    case "class-remove":
      return {
        ...base,
        kind: "class-add",
        confidence: op.confidence,
        target: op.target,
        className: op.className,
      };
    case "class-replace":
      return {
        ...base,
        kind: "class-replace",
        confidence: op.confidence,
        target: op.target,
        oldClassName: op.newClassName,
        newClassName: op.oldClassName,
      };
    case "reorder-child":
      return {
        ...base,
        kind: "reorder-child",
        confidence: op.confidence,
        parent: op.parent,
        child: op.child,
        fromIndex: op.toIndex,
        toIndex: op.fromIndex,
      };
    case "reparent-element":
      return {
        ...base,
        kind: "reparent-element",
        confidence: op.confidence,
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
        confidence: op.confidence,
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
        confidence: op.confidence,
        targets: op.previousTargets ?? [],
        groupId: op.groupId,
        previousTargets: op.targets,
      };
    case "group-reorder":
      return {
        ...base,
        kind: "group-reorder",
        confidence: op.confidence,
        parent: op.parent,
        children: op.children,
        previousOrder: op.newOrder,
        newOrder: op.previousOrder,
      };
    case "group-reparent":
      return {
        ...base,
        kind: "group-reparent",
        confidence: op.confidence,
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
        confidence: op.confidence,
        targets: op.targets,
        alignment: op.alignment,
        previousValues: op.newValues,
        newValues: op.previousValues,
      };
    case "distribute-elements":
      return {
        ...base,
        kind: "distribute-elements",
        confidence: op.confidence,
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
        confidence: op.confidence,
        container: op.container,
        property: op.property,
        value: op.previousValue ?? "",
        previousValue: op.value,
      };
    case "set-child-sizing":
      return {
        ...base,
        kind: "set-child-sizing",
        confidence: op.confidence,
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
        confidence: op.confidence,
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
        confidence: op.confidence,
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
        confidence: op.confidence,
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
        confidence: op.confidence,
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
        confidence: op.confidence,
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
        confidence: op.confidence,
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
    case "remove-style":
      // Inverse: restore the removed inline style via a style-edit.
      return {
        ...base,
        kind: "style-edit",
        confidence: op.confidence,
        target: op.target,
        property: op.property,
        value: op.previousValue ?? "",
        important: op.important ?? false,
        previousValue: op.previousValue ?? "",
      };
    case "set-attribute":
      // Inverse: a set-attribute restoring the prior value.
      return {
        ...base,
        kind: "set-attribute",
        confidence: op.confidence,
        target: op.target,
        name: op.name,
        value: op.previousValue ?? "",
        previousValue: op.value,
      };
    case "set-component-prop":
      // Inverse: swap value/previousValue; componentName/propName/sourceRange fixed.
      return {
        ...base,
        kind: "set-component-prop",
        confidence: op.confidence,
        target: op.target,
        componentName: op.componentName,
        propName: op.propName,
        value: op.previousValue ?? "",
        previousValue: op.value,
        sourceRange: op.sourceRange,
      };
    case "position-element":
      // Inverse: swap the from/to position values.
      return {
        ...base,
        kind: "position-element",
        confidence: op.confidence,
        target: op.target,
        property: op.property,
        fromValue: op.toValue,
        toValue: op.fromValue,
      };
    case "insert-element":
      // Inverse: remove the inserted element (Insert ↔ Remove are mutual).
      return {
        ...base,
        kind: "remove-element",
        confidence: op.confidence,
        element: op.element,
        parent: op.parent,
        index: op.index,
        tagName: op.tagName,
        ...(op.attributes !== undefined ? { attributes: op.attributes } : {}),
      };
    case "remove-element":
      // Inverse: re-insert the removed element (Remove ↔ Insert are mutual).
      return {
        ...base,
        kind: "insert-element",
        confidence: op.confidence,
        element: op.element,
        parent: op.parent,
        index: op.index,
        tagName: op.tagName,
        ...(op.attributes !== undefined ? { attributes: op.attributes } : {}),
      };
    case "duplicate-element":
      // Inverse: remove the duplicated node (the copy), leaving the source.
      return {
        ...base,
        kind: "remove-element",
        confidence: op.confidence,
        element: op.duplicate,
        parent: op.parent,
        index: op.index,
        tagName: op.tagName,
      };
    case "wrap-elements":
      // Inverse: unwrap the wrapper (Wrap ↔ Unwrap are mutual).
      return {
        ...base,
        kind: "unwrap-element",
        confidence: op.confidence,
        wrapper: op.wrapper,
        parent: op.parent,
        tagName: op.tagName,
        targets: op.targets,
      };
    case "unwrap-element":
      // Inverse: re-wrap the targets (Unwrap ↔ Wrap are mutual).
      return {
        ...base,
        kind: "wrap-elements",
        confidence: op.confidence,
        targets: op.targets,
        wrapper: op.wrapper,
        parent: op.parent,
        tagName: op.tagName,
      };
    default: {
      // Exhaustiveness guard: a new kind without a branch is a compile error.
      const exhaustive: never = op;
      throw new Error(`computeInverse: unhandled operation kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};
