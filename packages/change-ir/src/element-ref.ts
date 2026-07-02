import { z } from "zod";

/**
 * Minimal element reference used by change-ir operations.
 *
 * DELIBERATELY DEFINED INLINE in change-ir rather than imported from
 * `@vision-control/element-identity`. Task 7 builds element-identity in
 * parallel; importing it here would create a dependency cycle or a file
 * conflict during parallel execution. This minimal string-based reference is
 * structurally compatible with the future ElementRef from element-identity
 * (same fields: `runtimeId`, `sourceId?`, `selector?`). Later tasks can align
 * the types once element-identity lands. See decisions.md (VC-MVP-06).
 *
 * Anti-cheat note: this type identifies an element for an operation but says
 * nothing about whether the operation is a source change or a runtime preview
 * mutation. The `runtime` flag on {@link OperationBase} carries that
 * distinction (PRD §12.5, Appendix D.1).
 */
export const ElementRefSchema = z.object({
  /** Stable runtime id assigned by the inspector for the live element. */
  runtimeId: z.string().min(1),
  /** Opaque source marker id, present when source instrumentation resolved it. */
  sourceId: z.string().optional(),
  /** CSS selector fallback for elements without a stable id. */
  selector: z.string().optional(),
});

export type ElementRef = z.infer<typeof ElementRefSchema>;
