import { z } from "zod";

/**
 * Operation id pattern: URL-safe alphanumeric plus underscore/hyphen, 8-128
 * characters. Matches cuid2, nanoid, and UUID (with hyphens). Same family as
 * the protocol envelope's messageId pattern.
 */
export const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Fields shared by every operation. Each concrete operation schema extends
 * this base via `OperationBaseSchema.extend({ kind, ... })`.
 */
export const OperationBaseSchema = z.object({
  id: z.string().regex(OPERATION_ID_PATTERN),
  /**
   * References the operation whose effect this one reverses. Absent on forward
   * operations; present on operations returned by `computeInverse`.
   */
  inverseOf: z.string().regex(OPERATION_ID_PATTERN).optional(),
  /** Epoch milliseconds when the operation was created (non-negative integer). */
  timestamp: z.number().int().nonnegative(),
  /**
   * ANTI-CHEAT FLAG. `true` = this operation is a runtime preview mutation
   * (temporary transform, ghost element, drag preview). `false` = this is
   * intended as a source change. The verification engine (task 26) inspects
   * this flag: preview-only operations (`runtime: true`) MUST NEVER be treated
   * as source intent. A drag may apply a temporary transform at runtime while
   * its source intent is a reorder — the transform op is `runtime: true`, the
   * reorder op is `runtime: false`. See PRD §12.5 and Appendix D.1.
   *
   * The flag is preserved by `computeInverse`: the inverse of a preview
   * mutation is itself a preview mutation.
   */
  runtime: z.boolean(),
});

export type OperationBase = z.infer<typeof OperationBaseSchema>;
