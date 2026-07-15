/**
 * Content-owned verification (ADR-019 C6).
 *
 * Runs only in the content script against the real DOM. Always clears the
 * preview layer before asserting. Never treats an uncleared preview as pass.
 */

import type { Operation } from "@vision-control/change-ir";
import {
  createBrowserVerificationDomAdapter,
  createPlan,
  type PreviewClearer,
  runVerification,
  type SourceCandidate,
  type VerificationReport,
} from "@vision-control/verification-engine";

export interface ContentVerificationInput {
  readonly operations: readonly Operation[];
  readonly preview: PreviewClearer;
  readonly skipHmrWait?: boolean;
}

export interface ContentVerificationDetails {
  readonly verdict: "pass" | "fail";
  readonly assertions: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly expected: string;
    readonly actual: string;
    readonly message: string;
  }[];
  readonly retryContext?: string;
  readonly previewCleared: boolean;
}

export interface ContentVerificationOutcome {
  readonly passed: boolean;
  readonly details: ContentVerificationDetails;
}

function candidateFromRef(ref: {
  readonly sourceId?: string;
  readonly selector?: string;
  readonly runtimeId?: string;
}): SourceCandidate {
  const candidate: {
    sourceId?: string;
    selector?: string;
    fingerprint?: string;
  } = {};
  if (ref.sourceId !== undefined) candidate.sourceId = ref.sourceId;
  if (ref.selector !== undefined) candidate.selector = ref.selector;
  if (ref.runtimeId !== undefined) candidate.fingerprint = ref.runtimeId;
  return candidate;
}

function candidateFromOperation(operation: Operation): SourceCandidate {
  if ("target" in operation) {
    const target = operation.target;
    if (target !== undefined && typeof target === "object" && target !== null) {
      return candidateFromRef(
        target as {
          readonly sourceId?: string;
          readonly selector?: string;
          readonly runtimeId?: string;
        },
      );
    }
  }
  if ("element" in operation) {
    return candidateFromRef(
      operation.element as {
        readonly sourceId?: string;
        readonly selector?: string;
        readonly runtimeId?: string;
      },
    );
  }
  return {};
}

function mergeReports(reports: readonly VerificationReport[]): ContentVerificationDetails {
  const assertions = reports.flatMap((r) => r.assertions);
  const failed = reports.some((r) => r.verdict === "fail");
  const previewCleared = assertions
    .filter((a) => a.name === "preview-cleared")
    .every((a) => a.passed);
  const retry = reports.map((r) => r.retryContext).find((c) => c !== undefined);
  return {
    verdict: failed || !previewCleared ? "fail" : "pass",
    assertions,
    previewCleared,
    ...(retry !== undefined ? { retryContext: retry } : {}),
  };
}

/**
 * Clear preview then run verification plans for each operation.
 * Empty operations still clear preview and report a pass only when cleared.
 */
export async function runContentVerification(
  input: ContentVerificationInput,
): Promise<ContentVerificationOutcome> {
  const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
  const skipHmrWait = input.skipHmrWait ?? true;

  if (input.operations.length === 0) {
    input.preview.clearAll();
    const cleared = input.preview.activeCount === 0;
    const details: ContentVerificationDetails = {
      verdict: cleared ? "pass" : "fail",
      assertions: [
        {
          name: "preview-cleared",
          passed: cleared,
          expected: "preview layer empty (activeCount === 0)",
          actual: cleared ? "empty" : `${input.preview.activeCount} active`,
          message: cleared
            ? "Preview layer cleared before asserting."
            : "Preview layer was NOT cleared — anti-cheat guardrail.",
        },
      ],
      previewCleared: cleared,
    };
    return { passed: details.verdict === "pass", details };
  }

  const reports: VerificationReport[] = [];
  for (const operation of input.operations) {
    const plan = createPlan(operation, candidateFromOperation(operation));
    const report = await runVerification(plan, {
      dom,
      previewEngine: input.preview,
      skipHmrWait,
      requirePreviewCleared: true,
    });
    reports.push(report);
  }

  const details = mergeReports(reports);
  return { passed: details.verdict === "pass", details };
}
