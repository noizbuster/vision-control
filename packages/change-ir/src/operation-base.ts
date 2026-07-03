import { z } from "zod";

import { ElementRefSchema } from "./element-ref.js";

/**
 * Operation id pattern: URL-safe alphanumeric plus underscore/hyphen, 8-128
 * characters. Matches cuid2, nanoid, and UUID (with hyphens). Same family as
 * the protocol envelope's messageId pattern.
 */
export const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Identifies a responsive breakpoint an operation is scoped to (PRD §12.4).
 * A breakpoint identifier string (e.g. `"md"`, `"sm"`, `"(min-width: 768px)"`).
 * Structurally compatible with the `breakpoint` field on breakpoint-scoped
 * operations, which override the base optional to required.
 */
export const BreakpointContextSchema = z.string().min(1);
export type BreakpointContext = z.infer<typeof BreakpointContextSchema>;

/** CSS pseudo-state an operation targets (PRD §12.4). */
export const PseudoStateSchema = z.enum([":hover", ":focus", ":active", ":disabled"]);
export type PseudoState = z.infer<typeof PseudoStateSchema>;

/** Where the operation originated (PRD §12.4). */
export const OperationOriginSchema = z.enum(["property-panel", "canvas-drag", "shortcut", "agent"]);
export type OperationOrigin = z.infer<typeof OperationOriginSchema>;

/**
 * Fields shared by every operation (PRD §12.4). Each concrete operation schema
 * extends this base via `OperationBaseSchema.extend({ kind, ... })`.
 *
 * PRD §12.4 base fields:
 * - `target` — the primary element this operation acts on. Required at the
 *   base level; multi-element operations (group-reorder, align-elements, etc.)
 *   override it to optional since they carry their own collection fields.
 * - `breakpoint` — optional responsive breakpoint scope.
 * - `pseudoState` — optional CSS pseudo-state target.
 * - `origin` — the editing surface that emitted the operation. Defaults to
 *   `"property-panel"` (the primary editing surface); canvas gestures override
 *   to `"canvas-drag"`, keyboard shortcuts to `"shortcut"`, MCP/agent to
 *   `"agent"`.
 * - `confidence` — emitter confidence (0-1). Defaults to `1` for direct user
 *   edits.
 * - `notes` — optional human-readable annotations.
 *
 * Pre-existing base fields (`id`, `inverseOf`, `timestamp`, `runtime`) are
 * preserved unchanged.
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
  /** PRD §12.4: primary element this operation acts on. */
  target: ElementRefSchema,
  /** PRD §12.4: responsive breakpoint scope. */
  breakpoint: BreakpointContextSchema.optional(),
  /** PRD §12.4: CSS pseudo-state target. */
  pseudoState: PseudoStateSchema.optional(),
  /** PRD §12.4: operation origin. Defaults to `"property-panel"`. */
  origin: OperationOriginSchema.default("property-panel"),
  /** PRD §12.4: emitter confidence (0-1). Defaults to `1` for direct edits. */
  confidence: z.number().min(0).max(1).default(1),
  /** PRD §12.4: optional human-readable notes. */
  notes: z.array(z.string()).optional(),
});

export type OperationBase = z.infer<typeof OperationBaseSchema>;
