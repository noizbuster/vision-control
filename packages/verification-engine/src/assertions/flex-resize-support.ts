import type { ResizeFlexPairOperation } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";

import { type ResolvedFlexPair, resolveFlexPair } from "../flex-resize-resolution.js";
import type { AssertionResult, ResolvedTarget } from "../types.js";
import { DEFAULT_GEOMETRY_TOLERANCE } from "../types.js";

export type Observation = {
  readonly name: string;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly success: string;
  readonly failure: string;
};

export const observe = (value: Observation): AssertionResult => ({
  name: value.name,
  passed: value.passed,
  expected: value.expected,
  actual: value.actual,
  message: value.passed ? value.success : value.failure,
});

export function resolutionFailure(name: string, message: string): AssertionResult {
  return observe({
    name,
    passed: false,
    expected: "all durable refs resolve conjunctively",
    actual: message,
    success: "All paired refs resolved.",
    failure: `Paired identity failed: ${message}.`,
  });
}

export const normalizeCss = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

export const withinTolerance = (actual: number, expected: number): boolean =>
  Math.abs(actual - expected) <= DEFAULT_GEOMETRY_TOLERANCE;

export const usedMainSize = (rect: Rect, axis: "x" | "y"): number =>
  axis === "x" ? rect.width : rect.height;

export const formatRect = (rect: Rect): string =>
  `{x:${rect.x},y:${rect.y},width:${rect.width},height:${rect.height}}`;

export function resolveOrFailure(
  name: string,
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): ResolvedFlexPair | AssertionResult {
  const resolution = resolveFlexPair(target, operation);
  return resolution.kind === "resolved"
    ? resolution.pair
    : resolutionFailure(name, resolution.message);
}

export function isAssertionResult(
  value: ResolvedFlexPair | AssertionResult,
): value is AssertionResult {
  return "passed" in value;
}
