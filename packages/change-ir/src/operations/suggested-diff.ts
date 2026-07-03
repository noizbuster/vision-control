import { z } from "zod";

import { ElementRefSchema } from "../element-ref.js";
import { OperationBaseSchema } from "../operation-base.js";

/**
 * A `[startLine, startColumn, endLine, endColumn]`-shaped source range. Defined
 * inline (structurally identical to storage's `SourceRange`) so change-ir stays
 * free of node-only package deps.
 */
const SourceRangeSchema = z.object({
  startLine: z.number().int().nonnegative(),
  startColumn: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  endColumn: z.number().int().nonnegative(),
});

/**
 * An INERT deterministic patch suggestion. Carries the diff text, source
 * ranges, confidence, and preconditions for a safe static edit, but is NEVER
 * applied by the runtime or the MCP server (ADR-012). It is candidate data a
 * coding agent or human may choose to apply through their own file-writing
 * path. `applied` is always `false` on ingest; it exists only so the lifecycle
 * can be tracked without mutating source.
 *
 * Inverse (`computeInverse`): a no-op marker. The suggestion is metadata, not a
 * state change — the inverse re-emits the same inert data with a fresh id and
 * `inverseOf` linking back, `applied` held at `false`.
 */
export const SuggestedDiffOperationSchema = OperationBaseSchema.extend({
  kind: z.literal("suggested-diff"),
  /** Optional: the element the suggestion targets (absent for whole-file diffs). */
  target: ElementRefSchema.optional(),
  diff: z.string(),
  sourceRanges: z.array(SourceRangeSchema),
  confidence: z.enum(["high", "medium", "low"]),
  preconditions: z.array(z.string()),
  applied: z.boolean(),
});

export type SuggestedDiffOperation = z.infer<typeof SuggestedDiffOperationSchema>;
