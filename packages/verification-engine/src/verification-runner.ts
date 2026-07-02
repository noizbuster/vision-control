/**
 * Verification runner: the top-level entry point.
 *
 * Orchestrates the full verification loop after a source patch + HMR:
 *
 *   1. Wait for HMR completion (DOM stability).
 *   2. Clear the preview layer (MANDATORY — a preview that renders correctly
 *      does NOT prove the source changed, PRD Appendix D.1).
 *   3. Resolve the target element post-HMR.
 *   4. Run the plan's assertions against the resolved target.
 *   5. Check the console policy (no errors/warnings during verification).
 *   6. Compile a structured report with pass/fail and a retry context.
 *
 * If the preview was not cleared (still has active entries), the verdict is
 * hard-fail with an explicit retry message — the anti-cheat guardrail.
 */

import { assertConsoleClean } from "./assertions/console-policy.js";
import { assertExists } from "./assertions/existence.js";
import type { ConsoleEntry, VerificationDomAdapter } from "./dom-adapter.js";
import { waitForHmrComplete } from "./hmr-detector.js";
import { resolveTarget } from "./target-resolver.js";
import type {
  AssertionResult,
  PreviewClearer,
  ResolvedTarget,
  VerificationPlan,
  VerificationReport,
} from "./types.js";

/** Options for {@link runVerification}. */
export interface VerificationRunnerOptions {
  readonly dom: VerificationDomAdapter;
  /** Preview clearer (PreviewManager satisfies this structurally). */
  readonly previewEngine?: PreviewClearer;
  /** Console entries captured during the verification window. */
  readonly consoleEntries?: readonly ConsoleEntry[];
  /** Skip the HMR wait (when HMR is known to be complete already). Default false. */
  readonly skipHmrWait?: boolean;
  /** HMR timeout override in ms. */
  readonly hmrTimeout?: number;
  /**
   * When true, the runner asserts that the preview layer is empty after
   * clearing. Default true. Set false only for diagnostics.
   */
  readonly requirePreviewCleared?: boolean;
}

/**
 * Run a verification plan end-to-end and compile a structured report.
 *
 * @param plan The plan (source candidate + assertions).
 * @param options DOM adapter, preview clearer, console entries, timing.
 */
export async function runVerification(
  plan: VerificationPlan,
  options: VerificationRunnerOptions,
): Promise<VerificationReport> {
  const results: AssertionResult[] = [];

  // Step 1: Wait for HMR completion.
  if (options.skipHmrWait !== true) {
    const hmrOk = await waitForHmrComplete(
      options.hmrTimeout !== undefined ? { timeout: options.hmrTimeout } : {},
    );
    results.push({
      name: "hmr-complete",
      passed: hmrOk,
      expected: "DOM stable after HMR",
      actual: hmrOk ? "stable" : "timed out",
      message: hmrOk
        ? "DOM reached stability after HMR."
        : "HMR completion timed out; DOM may still be mutating.",
    });
  }

  // Step 2: Clear the preview layer (MANDATORY anti-cheat).
  const requireCleared = options.requirePreviewCleared ?? true;
  if (options.previewEngine !== undefined) {
    options.previewEngine.clearAll();
  }
  const previewCleared =
    options.previewEngine === undefined || options.previewEngine.activeCount === 0;
  if (requireCleared) {
    results.push({
      name: "preview-cleared",
      passed: previewCleared,
      expected: "preview layer empty (activeCount === 0)",
      actual: previewCleared ? "empty" : `${options.previewEngine?.activeCount ?? 0} active`,
      message: previewCleared
        ? "Preview layer cleared before asserting."
        : "Preview layer was NOT cleared — assertions would read preview state, not source state. This is the anti-cheat guardrail (PRD Appendix D.1).",
    });
    if (!previewCleared) {
      return compileReport(results, null, true);
    }
  }

  // Step 3: Resolve the target element post-HMR.
  const target = await resolveTarget(plan.sourceCandidate.sourceId, {
    dom: options.dom,
    hints: plan.sourceCandidate,
  });
  if (target === null) {
    results.push({
      name: "target-resolved",
      passed: false,
      expected: "element reacquired after HMR",
      actual: "not found",
      message:
        "Could not reacquire the target element after HMR. The source patch may have removed or unmounted it.",
    });
    return compileReport(results, null, true);
  }
  results.push({
    name: "target-resolved",
    passed: true,
    expected: "element reacquired after HMR",
    actual: `confidence: ${target.confidence}`,
    message: `Target reacquired with ${target.confidence} confidence.`,
  });

  // Step 4: assertExists (every plan implicitly checks existence).
  results.push(assertExists(target));

  // Step 5: Run plan-specific assertions.
  for (const entry of plan.assertions) {
    const result = entry.run(target);
    results.push({ ...result, name: entry.name });
  }

  // Step 6: Console policy.
  if (options.consoleEntries !== undefined) {
    results.push(assertConsoleClean(options.consoleEntries));
  }

  return compileReport(results, target, false);
}

/**
 * Compile results into a final report. `forceFail` short-circuits on
 * non-recoverable conditions (preview not cleared, target not found).
 */
function compileReport(
  results: AssertionResult[],
  target: ResolvedTarget | null,
  forceFail: boolean,
): VerificationReport {
  const allPassed = results.every((r) => r.passed);
  const verdict: "pass" | "fail" = allPassed && !forceFail ? "pass" : "fail";
  return {
    verdict,
    assertions: results,
    target,
    ...(verdict === "fail" ? { retryContext: buildRetryContext(results, target) } : {}),
  };
}

/**
 * Build a human-readable retry context for the agent. Lists which assertions
 * failed, the resolved target's confidence, and a diagnostic hint.
 */
function buildRetryContext(results: AssertionResult[], target: ResolvedTarget | null): string {
  const failed = results.filter((r) => !r.passed);
  const lines: string[] = [
    `Verification failed: ${failed.length} of ${results.length} assertion(s) failed.`,
  ];
  for (const f of failed) {
    lines.push(`- ${f.name}: ${f.message}`);
  }
  if (target !== null) {
    lines.push(
      `Target resolved with ${target.confidence} confidence` +
        `${target.sourceId !== undefined ? ` (sourceId: ${target.sourceId})` : ""}` +
        `${target.selector !== undefined ? ` (selector: ${target.selector})` : ""}.`,
    );
  }
  lines.push(
    "Check: the source patch may not have applied, HMR may not have completed, or the element identity drifted after reload.",
  );
  return lines.join("\n");
}
