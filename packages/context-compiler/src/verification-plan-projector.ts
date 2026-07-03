/**
 * Project the verification engine's per-operation plans into the JSON-safe
 * {@link VerificationPlanSummary} carried by the compiled context.
 *
 * The verification engine's `createPlan` returns `AssertionEntry[]` where each
 * entry carries a `run(target)` closure — NOT JSON-serializable. The compiled
 * context crosses the MCP/daemon boundary as JSON, so each entry's `name` is
 * projected into a `{ description }` record. The runner re-derives the closures
 * at verification time; the context carries only the human-readable plan so the
 * agent knows what will be checked.
 *
 * PRD Appendix D.1: assertions run ONLY after the preview layer is cleared. A
 * preview that renders correctly does NOT prove the source changed. That
 * invariant is noted on every emitted plan (R7 binding).
 */

import type { Operation } from "@vision-control/change-ir";
import { createPlan } from "@vision-control/verification-engine";

import type { VerificationPlanSummary } from "./context-schema.js";

const PREVIEW_CLEAR_NOTE =
  "assertions run only after the preview layer is cleared (anti-cheat, PRD Appendix D.1)";

/**
 * Build a JSON-safe verification plan summary from a changeset's operations.
 *
 * Each operation is mapped through the verification engine's `createPlan`; the
 * resulting assertion entries are projected to `{ description }` records. An
 * empty changeset yields an empty assertion list with an explanatory note.
 * Operations whose assertion generation is not yet implemented (the Task 6
 * structural kinds where `createPlan` throws) are recorded as pending notes
 * rather than failing the compile — the plan stays honest without crashing.
 */
export const projectVerificationPlan = (
  operations: readonly Operation[],
): VerificationPlanSummary => {
  const assertions: { description: string }[] = [];
  for (const op of operations) {
    try {
      const plan = createPlan(op, {});
      for (const entry of plan.assertions) {
        assertions.push({ description: entry.name });
      }
    } catch {
      // createPlan throws for kinds whose assertions land in a later task
      // (structural ops). Record a pending note; never crash the compile.
      assertions.push({ description: `${op.kind}:verification-pending` });
    }
  }
  const notes =
    operations.length === 0
      ? `no operations to verify; ${PREVIEW_CLEAR_NOTE}`
      : `verification plan derived from ${operations.length} operation(s); ${PREVIEW_CLEAR_NOTE}`;
  return { assertions, notes };
};
